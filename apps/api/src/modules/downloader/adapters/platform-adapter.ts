import { ParsedUrl, MediaMetadata, DownloadResult, Quality } from '../../../common/interfaces/platform.interface';

/**
 * Abstract base class for all platform adapters.
 *
 * Each platform (Facebook, Instagram, TikTok, etc.) must implement this interface.
 * The adapter pattern allows each platform's extraction logic to evolve independently
 * while maintaining a consistent contract for the downloader orchestrator.
 */
export abstract class PlatformAdapter {
  /** Unique platform identifier */
  abstract readonly name: string;

  /** Display name for UI */
  abstract readonly displayName: string;

  /** URL patterns this adapter can handle (regex patterns) */
  abstract readonly urlPatterns: RegExp[];

  /** Whether this adapter is currently operational */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Parse and validate a URL for this platform.
   * Extracts the media ID and normalizes the URL.
   */
  abstract parseUrl(url: string): ParsedUrl;

  /**
   * Extract metadata from the given URL.
   * Returns media info including available quality variants.
   */
  abstract extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata>;

  /**
   * Download media at the specified quality.
   * Returns the local file path and metadata about the downloaded file.
   */
  abstract download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult>;

  /**
   * Get supported content types for this platform.
   */
  abstract getSupportedTypes(): string[];

  /**
   * Validate that a URL belongs to this platform.
   */
  canHandle(url: string): boolean {
    return this.urlPatterns.some((pattern) => pattern.test(url));
  }
}
