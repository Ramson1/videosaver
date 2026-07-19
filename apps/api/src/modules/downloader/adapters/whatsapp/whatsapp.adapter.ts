import { Injectable, Logger } from '@nestjs/common';
import {
  Platform,
  MediaType,
  Quality,
  ParsedUrl,
  MediaMetadata,
  DownloadResult,
} from '../../../../common/interfaces/platform.interface';
import { PlatformAdapter } from '../platform-adapter';

/**
 * WhatsApp platform adapter.
 *
 * IMPORTANT - Privacy and Security Design:
 *
 * This adapter is designed with a strict privacy-first approach:
 *
 * 1. NO bypassing of WhatsApp security or end-to-end encryption.
 * 2. NO downloading of other users' private content.
 * 3. Only supports downloading from the AUTHENTICATED USER'S OWN WhatsApp Status.
 * 4. The user MUST link their own WhatsApp account through official channels.
 * 5. Only retrieves statuses the authenticated user is permitted to access.
 * 6. Designed for future integration via the official WhatsApp Business API.
 *
 * Current Status:
 * - This adapter is a placeholder that returns isDownloadable: false.
 * - Full functionality requires the user to link their WhatsApp account.
 * - The module is structured to accommodate future official API integrations.
 *
 * Future Integration Path:
 * - WhatsApp Business API (official Meta API)
 * - OAuth-based account linking
 * - User-consented status retrieval only
 */
@Injectable()
export class WhatsAppAdapter extends PlatformAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);

  readonly name = Platform.WHATSAPP;
  readonly displayName = 'WhatsApp';

  readonly urlPatterns: RegExp[] = [
    // WhatsApp Web links: web.whatsapp.com
    /(?:https?:\/\/)?web\.whatsapp\.com\//i,
    // WhatsApp general links: whatsapp.com
    /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\//i,
    // WhatsApp chat links: wa.me (short links)
    /(?:https?:\/\/)?wa\.me\//i,
  ];

  /**
   * Account linking status.
   * In a full implementation, this would be backed by a database and OAuth flow.
   */
  private accountLinked = false;

  /**
   * Thumbnail cache for reducing redundant network requests.
   * Maps status ID to cached thumbnail buffer/path.
   */
  private readonly thumbnailCache = new Map<string, { data: Buffer; cachedAt: Date }>();

  /**
   * Maximum age of cached thumbnails before invalidation (5 minutes).
   */
  private readonly thumbnailCacheTtlMs = 5 * 60 * 1000;

  /**
   * Check if the WhatsApp adapter is available.
   *
   * The adapter is always "available" in the sense that it can respond to requests,
   * but actual downloading requires account linking.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch('https://web.whatsapp.com', {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);
      return response.ok || response.status === 301 || response.status === 302;
    } catch (error) {
      this.logger.warn(`WhatsApp availability check failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Parse a WhatsApp URL and extract relevant identifiers.
   *
   * Note: WhatsApp URLs are typically not publicly shareable media links.
   * This parser handles the URL formats that may be encountered, but
   * actual media extraction requires authenticated access.
   */
  parseUrl(url: string): ParsedUrl {
    if (!url || typeof url !== 'string') {
      return {
        originalUrl: url ?? '',
        platform: Platform.WHATSAPP,
        mediaId: '',
        normalizedUrl: '',
        isValid: false,
        error: 'Invalid or empty URL',
      };
    }

    try {
      const mediaId = this.extractMediaId(url);
      const normalizedUrl = this.normalizeUrl(url);

      // WhatsApp URLs are recognized but not directly downloadable without auth
      return {
        originalUrl: url,
        platform: Platform.WHATSAPP,
        mediaId: mediaId || 'status',
        normalizedUrl,
        isValid: true,
      };
    } catch (error) {
      this.logger.warn(`Failed to parse WhatsApp URL: ${(error as Error).message}`);
      return {
        originalUrl: url,
        platform: Platform.WHATSAPP,
        mediaId: '',
        normalizedUrl: url,
        isValid: false,
        error: `URL parsing failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Extract metadata from a WhatsApp URL.
   *
   * CURRENT LIMITATION: This method always returns isDownloadable: false
   * because WhatsApp requires authenticated access to retrieve any media.
   * The user must link their own WhatsApp account first.
   *
   * FUTURE: When account linking is implemented, this method will:
   * 1. Verify the authenticated user has access to the requested status
   * 2. Retrieve only the statuses the user is permitted to view
   * 3. Respect WhatsApp's privacy model and consent requirements
   */
  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    this.logger.debug(
      `Metadata extraction requested for WhatsApp content: ${parsedUrl.mediaId}`,
    );

    // Check if the user has linked their account
    if (!this.accountLinked) {
      this.logger.warn(
        'WhatsApp account linking required. Cannot extract metadata without authentication.',
      );

      return this.buildAccountLinkingRequiredMetadata(parsedUrl);
    }

    // Even with account linking, we can only access the user's OWN statuses
    // This is a fundamental privacy constraint, not a technical limitation
    this.logger.warn(
      'WhatsApp status download requires explicit user consent and account linking. ' +
        'This feature is not yet implemented.',
    );

    return this.buildAccountLinkingRequiredMetadata(parsedUrl);
  }

  /**
   * Download WhatsApp media.
   *
   * CURRENT LIMITATION: Downloads are not available without account linking.
   * This method will always throw an error explaining the requirement.
   *
   * FUTURE: When the WhatsApp Business API integration is complete:
   * 1. Verify user authentication and consent
   * 2. Verify the requested content belongs to the authenticated user's status
   * 3. Download only through official, authorized channels
   * 4. Respect rate limits and WhatsApp's terms of service
   */
  async download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult> {
    this.logger.warn(
      `Download requested for WhatsApp content: ${parsedUrl.mediaId}. ` +
        'Download is not available without account linking.',
    );

    throw new Error(
      'WhatsApp media download is not currently available. ' +
        'This adapter requires the user to link their own WhatsApp account ' +
        'through official channels. WhatsApp content is protected by ' +
        'end-to-end encryption and can only be accessed by the authenticated user. ' +
        'No third-party tool can bypass this security model. ' +
        'Future versions may support downloads via the official WhatsApp Business API ' +
        'once account linking is implemented.',
    );
  }

  /**
   * Get supported content types.
   *
   * WhatsApp statuses can contain video, image, and text content.
   * However, all types currently require account linking.
   */
  getSupportedTypes(): string[] {
    return [MediaType.VIDEO, MediaType.IMAGE];
  }

  /**
   * Check whether the user has linked their WhatsApp account.
   */
  isAccountLinked(): boolean {
    return this.accountLinked;
  }

  /**
   * Clear the thumbnail cache.
   */
  clearThumbnailCache(): void {
    this.thumbnailCache.clear();
    this.logger.debug('WhatsApp thumbnail cache cleared');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract a media identifier from a WhatsApp URL.
   *
   * WhatsApp URLs do not typically contain public media IDs.
   * This method extracts what context it can from the URL structure.
   */
  private extractMediaId(url: string): string | null {
    // wa.me short links: wa.me/<phone>
    const waMeMatch = url.match(/wa\.me\/([\d]+)/i);
    if (waMeMatch) {
      return `contact_${waMeMatch[1]}`;
    }

    // web.whatsapp.com paths
    const webMatch = url.match(/web\.whatsapp\.com\/([\w./-]+)/i);
    if (webMatch) {
      return webMatch[1].replace(/\//g, '_');
    }

    // General whatsapp.com paths
    const generalMatch = url.match(/whatsapp\.com\/([\w./-]+)/i);
    if (generalMatch) {
      return generalMatch[1].replace(/\//g, '_');
    }

    return null;
  }

  /**
   * Normalize a WhatsApp URL to a canonical form.
   */
  private normalizeUrl(url: string): string {
    let normalized = url.replace(/^http:\/\//i, 'https://');

    // Ensure www prefix for whatsapp.com (but not web.whatsapp.com or wa.me)
    if (
      !/^(https:\/\/)?(www\.|web\.|wa\.)/i.test(normalized) &&
      /whatsapp\.com/i.test(normalized)
    ) {
      normalized = normalized.replace('https://', 'https://www.');
    }

    return normalized;
  }

  /**
   * Build a MediaMetadata response indicating that account linking is required.
   *
   * This is the core privacy-first response: we acknowledge the URL is valid
   * but clearly communicate that authenticated access is required.
   */
  private buildAccountLinkingRequiredMetadata(parsedUrl: ParsedUrl): MediaMetadata {
    return {
      platform: Platform.WHATSAPP,
      mediaId: parsedUrl.mediaId,
      title: 'WhatsApp Status',
      description:
        'WhatsApp status content requires the owner to link their WhatsApp account.',
      author: {
        name: 'WhatsApp User',
        username: undefined,
      },
      thumbnailUrl: undefined,
      mediaType: MediaType.VIDEO,
      variants: [],
      sourceUrl: parsedUrl.normalizedUrl,
      isDownloadable: false,
      restrictionReason: [
        'WhatsApp account linking is required.',
        'This adapter only supports downloading from your OWN WhatsApp Status.',
        'WhatsApp content is protected by end-to-end encryption.',
        'No third-party tool can bypass WhatsApp security or encryption.',
        'Future versions may support the official WhatsApp Business API.',
        'You must link your own WhatsApp account and provide explicit consent.',
      ].join(' '),
      extractedAt: new Date(),
    };
  }

  /**
   * Retrieve a cached thumbnail or return null if not cached / expired.
   *
   * FUTURE: When account linking is implemented, this will be used to
   * cache status thumbnails and reduce redundant network requests.
   */
  private getCachedThumbnail(statusId: string): Buffer | null {
    const cached = this.thumbnailCache.get(statusId);

    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.cachedAt.getTime();
    if (age > this.thumbnailCacheTtlMs) {
      this.thumbnailCache.delete(statusId);
      this.logger.debug(`Thumbnail cache expired for status: ${statusId}`);
      return null;
    }

    this.logger.debug(`Thumbnail cache hit for status: ${statusId}`);
    return cached.data;
  }

  /**
   * Store a thumbnail in the cache.
   *
   * FUTURE: Used when fetching status thumbnails through authenticated channels.
   */
  private cacheThumbnail(statusId: string, data: Buffer): void {
    // Evict oldest entries if cache grows too large
    if (this.thumbnailCache.size >= 100) {
      const oldestKey = this.thumbnailCache.keys().next().value;
      if (oldestKey) {
        this.thumbnailCache.delete(oldestKey);
      }
    }

    this.thumbnailCache.set(statusId, { data, cachedAt: new Date() });
    this.logger.debug(`Thumbnail cached for status: ${statusId}`);
  }
}
