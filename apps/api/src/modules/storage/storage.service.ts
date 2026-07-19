import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../auth/supabase.service';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuid } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly tempDir: string;
  private readonly signedUrlExpiry: number;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.bucket = this.config.get<string>('app.supabase.storageBucket', 'downloads');
    this.tempDir = this.config.get<string>('app.storage.tempDir', './tmp/downloads');
    this.signedUrlExpiry = this.config.get<number>('app.storage.signedUrlExpirySeconds', 3600);

    // Ensure temp directory exists
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Upload a file to Supabase Storage.
   */
  async uploadFile(
    filePath: string,
    userId?: string,
  ): Promise<{ storagePath: string; storageUrl: string; signedUrl: string }> {
    const fileName = `${userId || 'anonymous'}/${uuid()}${extname(filePath)}`;
    const fileStream = createReadStream(filePath);

    const { data, error } = await this.supabase
      .getAdminClient()
      .storage
      .from(this.bucket)
      .upload(fileName, fileStream, {
        contentType: this.getMimeType(filePath),
        upsert: false,
      });

    if (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    const { data: urlData } = this.supabase
      .getAdminClient()
      .storage
      .from(this.bucket)
      .getPublicUrl(data.path);

    const { data: signedData } = await this.supabase
      .getAdminClient()
      .storage
      .from(this.bucket)
      .createSignedUrl(data.path, this.signedUrlExpiry);

    return {
      storagePath: data.path,
      storageUrl: urlData.publicUrl,
      signedUrl: signedData?.signedUrl || urlData.publicUrl,
    };
  }

  /**
   * Generate a signed URL for an existing file.
   */
  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .storage
      .from(this.bucket)
      .createSignedUrl(storagePath, this.signedUrlExpiry);

    if (error) {
      this.logger.error(`Signed URL generation failed: ${error.message}`);
      throw new Error(`Signed URL failed: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Delete a file from storage.
   */
  async deleteFile(storagePath: string): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .storage
      .from(this.bucket)
      .remove([storagePath]);

    if (error) {
      this.logger.error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Get the temp directory path for downloads.
   */
  getTempDir(): string {
    return this.tempDir;
  }

  /**
   * Get a user-scoped temp directory.
   */
  getUserTempDir(userId?: string): string {
    const dir = join(this.tempDir, userId || 'anonymous');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
