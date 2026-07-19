import { Injectable, Logger } from '@nestjs/common';
import { Platform, ParsedUrl } from '../../common/interfaces/platform.interface';
import { PlatformAdapter } from './adapters/platform-adapter';
import { FacebookAdapter } from './adapters/facebook/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram/instagram.adapter';
import { TikTokAdapter } from './adapters/tiktok/tiktok.adapter';
import { YouTubeAdapter } from './adapters/youtube/youtube.adapter';
import { PinterestAdapter } from './adapters/pinterest/pinterest.adapter';
import { TwitterAdapter } from './adapters/twitter/twitter.adapter';
import { LinkedInAdapter } from './adapters/linkedin/linkedin.adapter';
import { SnapchatAdapter } from './adapters/snapchat/snapchat.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp/whatsapp.adapter';

/**
 * Detects the platform from a given URL and delegates to the appropriate adapter.
 */
@Injectable()
export class UrlDetectorService {
  private readonly logger = new Logger(UrlDetectorService.name);
  private readonly adapters: PlatformAdapter[];

  constructor(
    private readonly facebookAdapter: FacebookAdapter,
    private readonly instagramAdapter: InstagramAdapter,
    private readonly tiktokAdapter: TikTokAdapter,
    private readonly youtubeAdapter: YouTubeAdapter,
    private readonly pinterestAdapter: PinterestAdapter,
    private readonly twitterAdapter: TwitterAdapter,
    private readonly linkedinAdapter: LinkedInAdapter,
    private readonly snapchatAdapter: SnapchatAdapter,
    private readonly whatsappAdapter: WhatsAppAdapter,
  ) {
    this.adapters = [
      facebookAdapter,
      instagramAdapter,
      tiktokAdapter,
      youtubeAdapter,
      pinterestAdapter,
      twitterAdapter,
      linkedinAdapter,
      snapchatAdapter,
      whatsappAdapter,
    ];
  }

  /**
   * Detect which platform a URL belongs to.
   */
  detect(url: string): Platform {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url)) {
        this.logger.debug(`URL detected as ${adapter.displayName}`);
        return adapter.name as Platform;
      }
    }
    return Platform.UNKNOWN;
  }

  /**
   * Parse the URL using the appropriate platform adapter.
   */
  parseUrl(url: string): ParsedUrl {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url)) {
        return adapter.parseUrl(url);
      }
    }

    return {
      originalUrl: url,
      platform: Platform.UNKNOWN,
      mediaId: '',
      normalizedUrl: url,
      isValid: false,
      error: 'Unsupported platform or invalid URL',
    };
  }

  /**
   * Get the adapter for a detected platform.
   */
  getAdapter(platform: Platform): PlatformAdapter | undefined {
    return this.adapters.find((a) => a.name === platform);
  }

  /**
   * Get all registered adapters and their availability.
   */
  async getPlatformStatus(): Promise<
    Array<{ name: string; displayName: string; available: boolean; supportedTypes: string[] }>
  > {
    const statuses = await Promise.all(
      this.adapters.map(async (adapter) => ({
        name: adapter.name,
        displayName: adapter.displayName,
        available: await adapter.isAvailable(),
        supportedTypes: adapter.getSupportedTypes(),
      })),
    );
    return statuses;
  }
}
