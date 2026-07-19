import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UrlDetectorService } from './url-detector.service';
import { PlatformAdapter } from './adapters/platform-adapter';
import { GenericYtdlpAdapter } from './adapters/generic-ytdlp.adapter';
import {
  Platform,
  Quality,
  MediaMetadata,
  DownloadResult,
  ParsedUrl,
  JobStatus,
} from '../../common/interfaces/platform.interface';

export interface DownloadRequest {
  url: string;
  quality?: Quality;
  userId?: string;
}

export interface DownloadResponse {
  jobId: string;
  status: JobStatus;
  metadata?: MediaMetadata;
  result?: DownloadResult;
  error?: string;
}

@Injectable()
export class DownloaderService {
  private readonly logger = new Logger(DownloaderService.name);

  constructor(
    private readonly urlDetector: UrlDetectorService,
    private readonly config: ConfigService,
    private readonly genericYtdlpAdapter: GenericYtdlpAdapter,
  ) {}

  /**
   * Detect platform from URL and return parsed info.
   */
  detectPlatform(url: string): ParsedUrl {
    const parsed = this.urlDetector.parseUrl(url);
    if (!parsed.isValid) {
      throw new BadRequestException(parsed.error || 'Invalid or unsupported URL');
    }
    return parsed;
  }

  /**
   * Extract metadata from a URL.
   */
  async extractMetadata(url: string): Promise<MediaMetadata> {
    const parsed = this.detectPlatform(url);
    const adapter = this.urlDetector.getAdapter(parsed.platform);

    if (!adapter) {
      throw new NotFoundException(`No adapter found for platform: ${parsed.platform}`);
    }

    this.logger.log(`Extracting metadata from ${parsed.platform}: ${parsed.mediaId}`);

    try {
      const metadata = await adapter.extractMetadata(parsed);

      if (!metadata.isDownloadable) {
        this.logger.warn(
          `Content not downloadable: ${parsed.platform}/${parsed.mediaId} — ${metadata.restrictionReason}`,
        );
      }

      return metadata;
    } catch (error) {
      this.logger.warn(
        `Metadata extraction failed for ${url} via ${adapter.displayName}: ${(error as Error).message}`,
      );

      // Fallback: try generic yt-dlp adapter if available
      if (await this.genericYtdlpAdapter.isAvailable()) {
        this.logger.log(`Falling back to yt-dlp for: ${url}`);
        try {
          const metadata = await this.genericYtdlpAdapter.extractMetadata(parsed);
          this.logger.log(`yt-dlp fallback succeeded for: ${url}`);
          return metadata;
        } catch (fallbackError) {
          this.logger.error(`yt-dlp fallback also failed for ${url}`, fallbackError);
        }
      }

      throw new BadRequestException(
        `Failed to extract metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Execute a full download pipeline for a URL.
   */
  async download(request: DownloadRequest): Promise<DownloadResponse> {
    const { url, quality = Quality.HIGHEST } = request;
    const parsed = this.detectPlatform(url);
    const adapter = this.urlDetector.getAdapter(parsed.platform);

    if (!adapter) {
      throw new NotFoundException(`No adapter found for platform: ${parsed.platform}`);
    }

    const jobId = this.generateJobId();
    this.logger.log(`Download job ${jobId}: ${parsed.platform}/${parsed.mediaId} @ ${quality}`);

    try {
      // Extract metadata first
      const metadata = await adapter.extractMetadata(parsed);

      if (!metadata.isDownloadable) {
        return {
          jobId,
          status: JobStatus.FAILED,
          metadata,
          error: metadata.restrictionReason || 'Content is not downloadable',
        };
      }

      // Prepare output directory
      const outputDir = this.config.get<string>('app.storage.tempDir', './tmp/downloads');

      // Execute download
      const result = await adapter.download(parsed, quality, outputDir);

      this.logger.log(`Download completed: ${jobId} → ${result.filePath} (${result.fileSize} bytes)`);

      return {
        jobId,
        status: JobStatus.COMPLETED,
        metadata,
        result,
      };
    } catch (error) {
      this.logger.warn(
        `Download failed for ${url} via ${adapter.displayName}: ${(error as Error).message}`,
      );

      // Fallback: try generic yt-dlp adapter if available
      if (await this.genericYtdlpAdapter.isAvailable()) {
        this.logger.log(`Falling back to yt-dlp for download: ${url}`);
        try {
          const outputDir = this.config.get<string>('app.storage.tempDir', './tmp/downloads');
          const metadata = await this.genericYtdlpAdapter.extractMetadata(parsed);

          if (!metadata.isDownloadable) {
            return {
              jobId,
              status: JobStatus.FAILED,
              metadata,
              error: metadata.restrictionReason || 'Content is not downloadable',
            };
          }

          const result = await this.genericYtdlpAdapter.download(parsed, quality, outputDir);
          this.logger.log(`yt-dlp fallback download completed: ${jobId}`);
          return { jobId, status: JobStatus.COMPLETED, metadata, result };
        } catch (fallbackError) {
          this.logger.error(`yt-dlp fallback download also failed for ${url}`, fallbackError);
        }
      }

      return {
        jobId,
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  /**
   * Get all supported platforms and their capabilities.
   */
  async getSupportedPlatforms() {
    return this.urlDetector.getPlatformStatus();
  }

  private generateJobId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `dl_${timestamp}_${random}`;
  }
}
