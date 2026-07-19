import { Injectable, Logger } from '@nestjs/common';
import {
  Platform,
  MediaType,
  Quality,
  ParsedUrl,
  MediaMetadata,
  MediaVariant,
  DownloadResult,
} from '../../../../common/interfaces/platform.interface';
import { PlatformAdapter } from '../platform-adapter';
import { YtdlpService } from '../../services/ytdlp.service';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Rotating User-Agent pool to reduce rate-limiting from Twitter's CDN.
 */
const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/** Default HTTP timeout in milliseconds. */
const HTTP_TIMEOUT_MS = 15_000;

/**
 * Twitter / X platform adapter.
 *
 * Supports:
 * - Tweet videos (native + card-embedded)
 * - GIFs (served as .mp4 by Twitter's CDN)
 * - Single images and image tweets
 *
 * Extraction strategy:
 * 1. Parse tweet ID from URL (handles twitter.com, x.com, mobile subdomains, /status/ paths, query params).
 * 2. Fetch tweet data via the public syndication endpoint (no auth required for public tweets).
 * 3. Parse media entities to extract video variants (by bitrate) and image URLs.
 * 4. Download the selected variant to disk.
 */
@Injectable()
export class TwitterAdapter extends PlatformAdapter {
  private readonly logger = new Logger(TwitterAdapter.name);

  readonly name: string = Platform.TWITTER;
  readonly displayName: string = 'Twitter / X';

  readonly urlPatterns: RegExp[] = [
    /^https?:\/\/(www\.|mobile\.)?(twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
    /^https?:\/\/(www\.|mobile\.)?(twitter\.com|x\.com)\/i\/web\/status\/(\d+)/i,
  ];

  constructor(private readonly ytdlpService: YtdlpService) {
    super();
  }

  // ──────────────────────────────────────────────
  //  Availability
  // ──────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(
        'https://cdn.syndication.twimg.com/',
        { method: 'HEAD', signal: controller.signal },
      );
      clearTimeout(timer);

      // Syndication endpoint returns 200 or 403 — both mean the host is reachable.
      return response.ok || response.status === 403;
    } catch (error) {
      this.logger.warn(`Twitter syndication endpoint unreachable: ${(error as Error).message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  //  URL Parsing
  // ──────────────────────────────────────────────

  parseUrl(url: string): ParsedUrl {
    const base: ParsedUrl = {
      originalUrl: url,
      platform: Platform.TWITTER,
      mediaId: '',
      normalizedUrl: url,
      isValid: false,
    };

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').replace(/^mobile\./, '');

      if (host !== 'twitter.com' && host !== 'x.com') {
        return { ...base, error: `Unrecognised Twitter/X host: ${host}` };
      }

      // Match /<user>/status/<id>
      const statusMatch = parsed.pathname.match(/\/\w+\/status\/(\d+)/);
      if (!statusMatch) {
        return { ...base, error: 'Could not extract tweet ID from URL path' };
      }

      const tweetId = statusMatch[1];
      const normalized = `https://x.com/i/status/${tweetId}`;

      return {
        ...base,
        mediaId: tweetId,
        normalizedUrl: normalized,
        isValid: true,
      };
    } catch {
      return { ...base, error: 'Invalid URL format' };
    }
  }

  // ──────────────────────────────────────────────
  //  Metadata Extraction
  // ──────────────────────────────────────────────

  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    // --- Primary: Use yt-dlp if available ---
    if (this.ytdlpService.isAvailable()) {
      try {
        const metadata = await this.ytdlpService.buildMetadata(parsedUrl.originalUrl);
        if (metadata && metadata.variants.length > 0) {
          this.logger.debug(`yt-dlp extracted ${metadata.variants.length} variants for Twitter`);
          return metadata;
        }
        this.logger.debug('yt-dlp returned no variants, falling back to scraping');
      } catch (err) {
        this.logger.warn(`yt-dlp failed for Twitter: ${(err as Error).message} — falling back to scraping`);
      }
    }

    // --- Fallback: Original scraping approach ---
    if (!parsedUrl.isValid) {
      throw new Error(`Cannot extract metadata from invalid URL: ${parsedUrl.error}`);
    }

    const tweetId = parsedUrl.mediaId;
    this.logger.debug(`Extracting metadata for tweet ${tweetId}`);

    const tweetData = await this.fetchTweetSyndication(tweetId);
    return this.buildMetadata(tweetData, parsedUrl);
  }

  // ──────────────────────────────────────────────
  //  Download
  // ──────────────────────────────────────────────

  async download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult> {
    const metadata = await this.extractMetadata(parsedUrl);

    if (!metadata.isDownloadable) {
      throw new Error(
        `Tweet ${parsedUrl.mediaId} is not downloadable: ${metadata.restrictionReason ?? 'unknown'}`,
      );
    }

    const variant = this.selectVariant(metadata.variants, quality);
    const extension = this.extensionForFormat(variant.format);
    const fileName = `twitter_${parsedUrl.mediaId}_${variant.quality}${extension}`;
    const filePath = path.join(outputDir, fileName);

    this.logger.log(
      `Downloading tweet ${parsedUrl.mediaId} [${variant.quality}] → ${filePath}`,
    );

    const fileSize = await this.downloadFile(variant.url, filePath);

    return {
      jobId: crypto.randomUUID(),
      platform: Platform.TWITTER,
      mediaId: parsedUrl.mediaId,
      title: metadata.title,
      quality: variant.quality,
      filePath,
      fileSize,
      format: variant.format,
      thumbnailPath: metadata.thumbnailUrl
        ? (await this.downloadThumbnail(metadata.thumbnailUrl, path.join(outputDir, `twitter_${parsedUrl.mediaId}_thumb.jpg`)))
        : undefined,
      storageUrl: '',
      signedUrl: '',
      signedUrlExpiresAt: new Date(),
      duration: metadata.duration,
      completedAt: new Date(),
    };
  }

  // ──────────────────────────────────────────────
  //  Supported Types
  // ──────────────────────────────────────────────

  getSupportedTypes(): string[] {
    return [MediaType.VIDEO, MediaType.GIF, MediaType.IMAGE];
  }

  // ──────────────────────────────────────────────
  //  Private — Syndication Fetch
  // ──────────────────────────────────────────────

  /**
   * Fetch tweet data from Twitter's public syndication API.
   * This endpoint does not require authentication for public tweets.
   */
  private async fetchTweetSyndication(tweetId: string): Promise<any> {
    const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&features=tfw_timeline_list%3A`;
    const ua = this.randomUserAgent();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(syndicationUrl, {
        headers: {
          'User-Agent': ua,
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Syndication API returned HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Failed to fetch tweet ${tweetId}: ${message}`);
      throw new Error(`Failed to fetch tweet data: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // ──────────────────────────────────────────────
  //  Private — Metadata Builder
  // ──────────────────────────────────────────────

  private buildMetadata(tweetData: any, parsedUrl: ParsedUrl): MediaMetadata {
    const tweet = tweetData;
    const user = tweet.user ?? tweetData?.author ?? {};
    const mediaDetails: any[] = this.extractMediaDetails(tweet);

    if (mediaDetails.length === 0) {
      return {
        platform: Platform.TWITTER,
        mediaId: parsedUrl.mediaId,
        title: this.truncateText(tweet.text ?? tweet.full_text ?? 'Untitled Tweet', 200),
        description: tweet.text ?? tweet.full_text,
        author: {
          name: user.name ?? 'Unknown',
          username: user.screen_name ?? user.username,
          avatarUrl: user.profile_image_url_https,
          profileUrl: user.screen_name
            ? `https://x.com/${user.screen_name}`
            : undefined,
        },
        mediaType: MediaType.IMAGE,
        variants: [],
        sourceUrl: parsedUrl.normalizedUrl,
        isDownloadable: false,
        restrictionReason: 'No media found in tweet',
        extractedAt: new Date(),
      };
    }

    // Use the first media entity as primary.
    const primary = mediaDetails[0];
    const mediaType = this.classifyMediaType(primary);
    const variants = this.buildVariants(primary);
    const thumbnail = this.extractThumbnail(primary, tweet);
    const duration = primary.video_info?.duration_millis
      ? primary.video_info.duration_millis / 1000
      : undefined;

    return {
      platform: Platform.TWITTER,
      mediaId: parsedUrl.mediaId,
      title: this.truncateText(tweet.text ?? tweet.full_text ?? 'Untitled Tweet', 200),
      description: tweet.text ?? tweet.full_text,
      author: {
        name: user.name ?? 'Unknown',
        username: user.screen_name ?? user.username,
        avatarUrl: user.profile_image_url_https,
        profileUrl: user.screen_name
          ? `https://x.com/${user.screen_name}`
          : undefined,
      },
      thumbnailUrl: thumbnail,
      duration,
      mediaType,
      variants,
      sourceUrl: parsedUrl.normalizedUrl,
      isDownloadable: variants.length > 0 || mediaType === MediaType.IMAGE,
      extractedAt: new Date(),
    };
  }

  /**
   * Extract media detail objects from the syndication response.
   * The shape varies across API versions; handle both common layouts.
   */
  private extractMediaDetails(tweet: any): any[] {
    // Layout 1: tweet.mediaDetails (syndication v2)
    if (Array.isArray(tweet?.mediaDetails) && tweet.mediaDetails.length > 0) {
      return tweet.mediaDetails;
    }

    // Layout 2: tweet.extended_entities.media (legacy)
    if (Array.isArray(tweet?.extended_entities?.media)) {
      return tweet.extended_entities.media;
    }

    // Layout 3: single photo in tweet.photos
    if (Array.isArray(tweet?.photos) && tweet.photos.length > 0) {
      return tweet.photos.map((p: any) => ({
        type: 'photo',
        media_url_https: p.url ?? p.imageUrl,
        sizes: { large: { w: p.width, h: p.height } },
      }));
    }

    // Layout 4: video in tweet.video
    if (tweet?.video) {
      return [{
        type: 'video',
        media_url_https: tweet.video.poster ?? tweet.video.thumbnail,
        video_info: {
          duration_millis: tweet.video.duration
            ? tweet.video.duration * 1000
            : undefined,
          variants: tweet.video.variants ?? [],
        },
      }];
    }

    return [];
  }

  private classifyMediaType(media: any): MediaType {
    const type: string = (media.type ?? '').toLowerCase();

    if (type === 'animated_gif') return MediaType.GIF;
    if (type === 'video') return MediaType.VIDEO;
    return MediaType.IMAGE;
  }

  /**
   * Build downloadable variants from a media entity.
   * For videos, each bitrate becomes a variant.
   * For images, we generate variants from the available size extensions.
   */
  private buildVariants(media: any): MediaVariant[] {
    if (media.type === 'video' || media.type === 'animated_gif') {
      return this.buildVideoVariants(media);
    }

    return this.buildImageVariants(media);
  }

  private buildVideoVariants(media: any): MediaVariant[] {
    const variants: any[] = media.video_info?.variants ?? [];
    const results: MediaVariant[] = [];

    for (const v of variants) {
      // content_type can be "video/mp4", "application/x-mpegURL", etc.
      const contentType: string = v.content_type ?? '';
      if (!contentType.includes('mp4')) continue;

      const bitrate: number = v.bitrate ?? 0;
      const quality = this.bitrateToQuality(bitrate);
      const width = media.sizes?.large?.w ?? media.original_info?.width;
      const height = media.sizes?.large?.h ?? media.original_info?.height;

      results.push({
        quality,
        url: v.url,
        format: 'mp4',
        hasAudio: media.type !== 'animated_gif',
        hasVideo: true,
        width,
        height,
      });
    }

    // Sort descending by bitrate (highest quality first).
    results.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    return results;
  }

  private buildImageVariants(media: any): MediaVariant[] {
    const baseUrl: string = media.media_url_https ?? media.media_url ?? '';
    if (!baseUrl) return [];

    const width = media.sizes?.large?.w ?? media.original_info?.width;
    const height = media.sizes?.large?.h ?? media.original_info?.height;

    // Twitter images support format suffixes: ?format=jpg&name=orig|large|medium|small
    const variants: MediaVariant[] = [];

    const sizeMap: Array<{ name: string; quality: Quality }> = [
      { name: 'orig', quality: Quality.ORIGINAL },
      { name: '4096x4096', quality: Quality.HIGHEST },
      { name: 'large', quality: Quality.P1080 },
      { name: 'medium', quality: Quality.P720 },
      { name: 'small', quality: Quality.P360 },
    ];

    const format = this.detectImageFormat(baseUrl);

    for (const { name, quality } of sizeMap) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      variants.push({
        quality,
        url: `${baseUrl}${separator}format=${format}&name=${name}`,
        format,
        hasAudio: false,
        hasVideo: false,
        width,
        height,
      });
    }

    return variants;
  }

  private extractThumbnail(media: any, tweet: any): string | undefined {
    if (media.type === 'video' || media.type === 'animated_gif') {
      return media.media_url_https ?? media.media_url;
    }

    // For image tweets, use the tweet card or user banner as fallback.
    return (
      tweet.card?.binding_values?.thumbnail_image_original?.image_value?.url ??
      undefined
    );
  }

  // ──────────────────────────────────────────────
  //  Private — Helpers
  // ──────────────────────────────────────────────

  /**
   * Map video bitrate (bps) to a Quality enum value.
   */
  private bitrateToQuality(bitrate: number): Quality {
    if (bitrate >= 4_000_000) return Quality.P1080;
    if (bitrate >= 2_000_000) return Quality.P720;
    if (bitrate >= 1_000_000) return Quality.P480;
    return Quality.P360;
  }

  /**
   * Select the best variant matching the requested quality.
   */
  private selectVariant(variants: MediaVariant[], requested: Quality): MediaVariant {
    if (variants.length === 0) {
      throw new Error('No downloadable variants available');
    }

    // Exact match.
    const exact = variants.find((v) => v.quality === requested);
    if (exact) return exact;

    // Quality hierarchy for fallback.
    const hierarchy: Quality[] = [
      Quality.ORIGINAL,
      Quality.HIGHEST,
      Quality.P1080,
      Quality.P720,
      Quality.P480,
      Quality.P360,
    ];

    const requestedIdx = hierarchy.indexOf(requested);
    if (requestedIdx === -1) return variants[0];

    // Try progressively lower qualities.
    for (let i = requestedIdx; i < hierarchy.length; i++) {
      const match = variants.find((v) => v.quality === hierarchy[i]);
      if (match) return match;
    }

    // Fall back to the first available.
    return variants[0];
  }

  /**
   * Download a file from a URL to a local path. Returns the file size in bytes.
   */
  private async downloadFile(url: string, destPath: string): Promise<number> {
    const ua = this.randomUserAgent();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Referer: 'https://x.com/',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, buffer);

      return buffer.byteLength;
    } catch (error) {
      this.logger.error(`File download failed for ${url}: ${(error as Error).message}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Download a thumbnail image and return its path.
   */
  private async downloadThumbnail(url: string, destPath: string): Promise<string | undefined> {
    try {
      await this.downloadFile(url, destPath);
      return destPath;
    } catch (error) {
      this.logger.warn(`Failed to download thumbnail: ${(error as Error).message}`);
      return undefined;
    }
  }

  private detectImageFormat(url: string): string {
    if (url.includes('.png')) return 'png';
    if (url.includes('.webp')) return 'webp';
    return 'jpg';
  }

  private extensionForFormat(format: string): string {
    const map: Record<string, string> = {
      mp4: '.mp4',
      jpg: '.jpg',
      jpeg: '.jpg',
      png: '.png',
      webp: '.webp',
      gif: '.gif',
    };
    return map[format.toLowerCase()] ?? `.${format}`;
  }

  private randomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
  }
}
