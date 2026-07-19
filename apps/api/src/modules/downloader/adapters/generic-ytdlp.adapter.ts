import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  Platform,
  MediaType,
  Quality,
  ParsedUrl,
  MediaMetadata,
  DownloadResult,
} from '../../../common/interfaces/platform.interface';
import { PlatformAdapter } from './platform-adapter';
import { YtdlpService } from '../services/ytdlp.service';

/**
 * Generic adapter that delegates to yt-dlp for any supported URL.
 * Used as a fallback when platform-specific adapters fail or when
 * yt-dlp is available and provides better extraction.
 */
@Injectable()
export class GenericYtdlpAdapter extends PlatformAdapter {
  readonly name = Platform.UNKNOWN;
  readonly displayName = 'Generic (yt-dlp)';

  /**
   * Broad URL patterns that yt-dlp can handle.
   * These are intentionally permissive — yt-dlp itself will validate.
   */
  readonly urlPatterns: RegExp[] = [
    /^https?:\/\/(www\.|m\.|vm\.)?tiktok\.com\//i,
    /^https?:\/\/(www\.|m\.)?instagram\.com\//i,
    /^https?:\/\/(www\.|m\.)?facebook\.com\//i,
    /^https?:\/\/fb\.watch\//i,
    /^https?:\/\/(www\.|mobile\.)?(twitter\.com|x\.com)\//i,
    /^https?:\/\/(www\.)?pinterest\.(com|co\.\w+|pin\.it)\//i,
    /^https?:\/\/(www\.)?linkedin\.com\//i,
    /^https?:\/\/(www\.)?snapchat\.com\//i,
    /^https?:\/\/(www\.)?reddit\.com\//i,
    /^https?:\/\/(www\.)?vimeo\.com\//i,
    /^https?:\/\/(www\.)?twitch\.tv\//i,
    /^https?:\/\/(www\.)?dailymotion\.com\//i,
  ];

  private readonly logger = new Logger(GenericYtdlpAdapter.name);

  constructor(
    private readonly ytdlpService: YtdlpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async isAvailable(): Promise<boolean> {
    return this.ytdlpService.isAvailable();
  }

  parseUrl(url: string): ParsedUrl {
    const trimmed = url.trim();
    const canHandle = this.urlPatterns.some((p) => p.test(trimmed));

    if (!canHandle) {
      return {
        originalUrl: trimmed,
        platform: Platform.UNKNOWN,
        mediaId: '',
        normalizedUrl: trimmed,
        isValid: false,
        error: 'URL does not match any known pattern for yt-dlp',
      };
    }

    // Extract a pseudo mediaId from the URL path
    const urlObj = new URL(trimmed);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const mediaId = pathParts[pathParts.length - 1] || urlObj.hostname;

    return {
      originalUrl: trimmed,
      platform: Platform.UNKNOWN,
      mediaId,
      normalizedUrl: trimmed,
      isValid: true,
    };
  }

  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    if (!this.ytdlpService.isAvailable()) {
      throw new Error('yt-dlp is not available on this system');
    }

    const metadata = await this.ytdlpService.buildMetadata(parsedUrl.originalUrl);
    if (!metadata) {
      throw new Error(`yt-dlp could not extract metadata from: ${parsedUrl.originalUrl}`);
    }

    return metadata;
  }

  async download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult> {
    if (!this.ytdlpService.isAvailable()) {
      throw new Error('yt-dlp is not available on this system');
    }

    this.logger.debug(`Downloading via yt-dlp: ${parsedUrl.originalUrl} @ ${quality}`);

    // Get metadata first
    const metadata = await this.extractMetadata(parsedUrl);

    if (!metadata.isDownloadable) {
      throw new Error(`Content not downloadable: ${metadata.restrictionReason ?? 'unknown reason'}`);
    }

    // Use yt-dlp to download
    const result = await this.ytdlpService.download(parsedUrl.originalUrl, quality, outputDir);
    if (!result) {
      throw new Error('yt-dlp download failed');
    }

    const now = new Date();
    const signedUrlExpiry = new Date(
      now.getTime() +
        (this.configService.get<number>('app.storage.signedUrlExpirySeconds') ?? 3600) * 1000,
    );

    return {
      jobId: crypto.randomUUID(),
      platform: metadata.platform,
      mediaId: metadata.mediaId,
      title: metadata.title,
      quality,
      filePath: result.filePath,
      fileSize: result.fileSize,
      format: result.format,
      thumbnailPath: undefined,
      storageUrl: '',
      signedUrl: '',
      signedUrlExpiresAt: signedUrlExpiry,
      duration: metadata.duration,
      completedAt: now,
    };
  }

  getSupportedTypes(): string[] {
    return [MediaType.VIDEO, MediaType.IMAGE, MediaType.AUDIO];
  }
}
