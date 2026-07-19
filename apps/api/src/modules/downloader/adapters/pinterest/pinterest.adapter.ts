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
 * Rotating User-Agent pool for Pinterest requests.
 */
const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const HTTP_TIMEOUT_MS = 15_000;

/**
 * Pinterest platform adapter.
 *
 * Supports:
 * - Image Pins (static images)
 * - Video Pins (native video uploads)
 * - Short links (pin.it)
 *
 * Extraction strategy:
 * 1. Parse pin ID from URL (handles pinterest.com/pin/<id>, pin.it/<slug>, regional domains).
 * 2. For pin.it short links, follow the redirect to resolve the canonical URL.
 * 3. Fetch the pin page HTML and extract embedded JSON (initial data / __PWS_DATA__) or
 *    use Pinterest's internal resource endpoint.
 * 4. Parse image/video URLs from the extracted data.
 * 5. Download the selected variant.
 */
@Injectable()
export class PinterestAdapter extends PlatformAdapter {
  private readonly logger = new Logger(PinterestAdapter.name);

  readonly name: string = Platform.PINTEREST;
  readonly displayName: string = 'Pinterest';

  readonly urlPatterns: RegExp[] = [
    /^https?:\/\/(www\.|vm?\.)?(pinterest\.com|pinterest\.co\.\w+|pin\.it)\/.+/i,
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

      const response = await fetch('https://www.pinterest.com/', {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': this.randomUserAgent() },
      });
      clearTimeout(timer);

      return response.ok || response.status === 302;
    } catch (error) {
      this.logger.warn(`Pinterest unreachable: ${(error as Error).message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  //  URL Parsing
  // ──────────────────────────────────────────────

  parseUrl(url: string): ParsedUrl {
    const base: ParsedUrl = {
      originalUrl: url,
      platform: Platform.PINTEREST,
      mediaId: '',
      normalizedUrl: url,
      isValid: false,
    };

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      // pin.it short links — we can't extract a pin ID without resolving the redirect.
      if (host === 'pin.it' || host.endsWith('.pin.it')) {
        const slug = parsed.pathname.replace(/^\//, '');
        if (!slug) {
          return { ...base, error: 'Empty pin.it short link' };
        }

        return {
          ...base,
          mediaId: `short:${slug}`,
          normalizedUrl: url,
          isValid: true,
        };
      }

      // Standard /pin/<id> path.
      const pinMatch = parsed.pathname.match(/\/pin\/(\d+)/);
      if (pinMatch) {
        const pinId = pinMatch[1];
        return {
          ...base,
          mediaId: pinId,
          normalizedUrl: `https://www.pinterest.com/pin/${pinId}/`,
          isValid: true,
        };
      }

      // Some URLs use /pin/<id>/<slug>/
      const pinSlugMatch = parsed.pathname.match(/\/pin\/([^/]+)/);
      if (pinSlugMatch && /^\d+$/.test(pinSlugMatch[1])) {
        return {
          ...base,
          mediaId: pinSlugMatch[1],
          normalizedUrl: `https://www.pinterest.com/pin/${pinSlugMatch[1]}/`,
          isValid: true,
        };
      }

      return { ...base, error: 'Could not extract pin ID from URL' };
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
          this.logger.debug(`yt-dlp extracted ${metadata.variants.length} variants for Pinterest`);
          return metadata;
        }
        this.logger.debug('yt-dlp returned no variants, falling back to scraping');
      } catch (err) {
        this.logger.warn(`yt-dlp failed for Pinterest: ${(err as Error).message} — falling back to scraping`);
      }
    }

    // --- Fallback: Original scraping approach ---
    if (!parsedUrl.isValid) {
      throw new Error(`Cannot extract metadata from invalid URL: ${parsedUrl.error}`);
    }

    let resolvedUrl = parsedUrl.normalizedUrl;
    let pinId = parsedUrl.mediaId;

    // Resolve pin.it short links.
    if (pinId.startsWith('short:')) {
      const resolved = await this.resolveShortLink(parsedUrl.originalUrl);
      resolvedUrl = resolved.url;
      pinId = resolved.pinId;
    }

    this.logger.debug(`Extracting metadata for pin ${pinId}`);

    const pinData = await this.fetchPinPage(resolvedUrl);
    return this.buildMetadata(pinData, pinId, resolvedUrl);
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
        `Pin ${parsedUrl.mediaId} is not downloadable: ${metadata.restrictionReason ?? 'unknown'}`,
      );
    }

    const variant = this.selectVariant(metadata.variants, quality);
    const extension = this.extensionForFormat(variant.format);
    const pinId = parsedUrl.mediaId.startsWith('short:')
      ? (await this.resolveShortLink(parsedUrl.originalUrl)).pinId
      : parsedUrl.mediaId;

    const fileName = `pinterest_${pinId}${extension}`;
    const filePath = path.join(outputDir, fileName);

    this.logger.log(`Downloading pin ${pinId} → ${filePath}`);

    const fileSize = await this.downloadFile(variant.url, filePath);

    return {
      jobId: crypto.randomUUID(),
      platform: Platform.PINTEREST,
      mediaId: pinId,
      title: metadata.title,
      quality: variant.quality,
      filePath,
      fileSize,
      format: variant.format,
      thumbnailPath: metadata.thumbnailUrl
        ? (await this.downloadThumbnail(
            metadata.thumbnailUrl,
            path.join(outputDir, `pinterest_${pinId}_thumb.jpg`),
          ))
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
    return [MediaType.IMAGE, MediaType.VIDEO];
  }

  // ──────────────────────────────────────────────
  //  Private — Short Link Resolution
  // ──────────────────────────────────────────────

  private async resolveShortLink(
    url: string,
  ): Promise<{ url: string; pinId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      let currentUrl = url;
      const maxRedirects = 5;

      // Follow redirects manually to handle Pinterest's multi-step redirects
      for (let i = 0; i < maxRedirects; i++) {
        const response = await fetch(currentUrl, {
          method: 'GET',
          headers: { 'User-Agent': this.randomUserAgent() },
          redirect: 'manual',
          signal: controller.signal,
        });

        const location = response.headers.get('location');
        
        // If no redirect, we've reached the final URL
        if (!location) {
          // Check if the current URL contains a pin ID
          const pinMatch = new URL(currentUrl).pathname.match(/\/pin\/(\d+)/);
          if (pinMatch) {
            return {
              url: `https://www.pinterest.com/pin/${pinMatch[1]}/`,
              pinId: pinMatch[1],
            };
          }
          throw new Error(`Resolved short link does not contain a pin ID: ${currentUrl}`);
        }

        // Follow the redirect
        currentUrl = new URL(location, currentUrl).toString();
        
        // Check if we've reached the pin URL
        const pinMatch = new URL(currentUrl).pathname.match(/\/pin\/(\d+)/);
        if (pinMatch) {
          return {
            url: `https://www.pinterest.com/pin/${pinMatch[1]}/`,
            pinId: pinMatch[1],
          };
        }
      }

      throw new Error(`Exceeded maximum redirects while resolving short link`);
    } catch (error) {
      this.logger.error(`Failed to resolve pin.it link: ${(error as Error).message}`);
      throw new Error(`Failed to resolve Pinterest short link: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // ──────────────────────────────────────────────
  //  Private — Pin Page Fetch
  // ──────────────────────────────────────────────

  /**
   * Fetch the pin page HTML and extract embedded JSON data.
   * Pinterest embeds initial state in a <script> tag as window.__PWS_DATA__ or
   * as JSON-LD structured data.
   */
  private async fetchPinPage(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const ua = this.randomUserAgent();

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: '',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Pinterest page returned HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parsePinPageHtml(html);
    } catch (error) {
      this.logger.error(`Failed to fetch pin page: ${(error as Error).message}`);
      throw new Error(`Failed to fetch Pinterest page: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse pin page HTML to extract media data.
   * Tries multiple embedded-data strategies used by Pinterest.
   */
  private parsePinPageHtml(html: string): any {
    // Strategy 1: JSON-LD structured data (most reliable).
    const jsonLdMatch = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        if (data['@type'] === 'Pin' || data.contentUrl || data.thumbnailUrl) {
          return this.parseJsonLd(data);
        }
      } catch {
        // JSON-LD parse failure — continue to next strategy.
      }
    }

    // Strategy 2: __PWS_DATA__ or initial state script.
    const pwsMatch = html.match(
      /window\.__PWS_DATA__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    );
    if (pwsMatch) {
      try {
        return JSON.parse(pwsMatch[1]);
      } catch {
        // Continue.
      }
    }

    // Strategy 3: Extract og: meta tags as fallback.
    return this.parseOpenGraphMeta(html);
  }

  private parseJsonLd(data: any): any {
    const contentUrl: string | undefined = data.contentUrl;
    const thumbnailUrl: string | undefined = data.thumbnailUrl;
    const isVideo = contentUrl && this.isVideoUrl(contentUrl);

    return {
      type: isVideo ? 'video' : 'image',
      contentUrl: contentUrl ?? thumbnailUrl,
      thumbnailUrl,
      title: data.name ?? data.headline ?? '',
      description: data.description ?? '',
      author: data.author?.name ?? '',
      authorUrl: data.author?.url ?? '',
      width: data.width ?? undefined,
      height: data.height ?? undefined,
      duration: data.duration ? this.parseIso8601Duration(data.duration) : undefined,
      uploadDate: data.uploadDate,
    };
  }

  private parseOpenGraphMeta(html: string): any {
    const getMeta = (property: string): string | undefined => {
      const match = html.match(
        new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
      );
      return match?.[1];
    };

    const videoUrl = getMeta('og:video:url') ?? getMeta('og:video:secure_url');
    const imageUrl = getMeta('og:image');

    return {
      type: videoUrl ? 'video' : 'image',
      contentUrl: videoUrl ?? imageUrl ?? '',
      thumbnailUrl: imageUrl,
      title: getMeta('og:title') ?? '',
      description: getMeta('og:description') ?? '',
      author: '',
      authorUrl: '',
    };
  }

  // ──────────────────────────────────────────────
  //  Private — Metadata Builder
  // ──────────────────────────────────────────────

  private buildMetadata(
    pinData: any,
    pinId: string,
    sourceUrl: string,
  ): MediaMetadata {
    const isVideo = pinData.type === 'video';
    const mediaType = isVideo ? MediaType.VIDEO : MediaType.IMAGE;
    const variants = this.buildVariants(pinData);

    return {
      platform: Platform.PINTEREST,
      mediaId: pinId,
      title: pinData.title || `Pin ${pinId}`,
      description: pinData.description || undefined,
      author: {
        name: pinData.author || 'Unknown',
        profileUrl: pinData.authorUrl || undefined,
      },
      thumbnailUrl: pinData.thumbnailUrl,
      duration: pinData.duration,
      mediaType,
      variants,
      sourceUrl,
      isDownloadable: variants.length > 0,
      restrictionReason: variants.length === 0 ? 'No media URL found in pin data' : undefined,
      extractedAt: new Date(),
    };
  }

  private buildVariants(pinData: any): MediaVariant[] {
    const contentUrl: string = pinData.contentUrl ?? '';
    if (!contentUrl) return [];

    const isVideo = this.isVideoUrl(contentUrl);
    const width = pinData.width ? Number(pinData.width) : undefined;
    const height = pinData.height ? Number(pinData.height) : undefined;

    if (isVideo) {
      return [
        {
          quality: Quality.ORIGINAL,
          url: contentUrl,
          format: this.detectVideoFormat(contentUrl),
          hasAudio: true,
          hasVideo: true,
          width,
          height,
        },
      ];
    }

    // Image variants — Pinterest serves different resolutions via URL suffixes.
    const variants: MediaVariant[] = [];
    const format = this.detectImageFormat(contentUrl);

    // Original.
    variants.push({
      quality: Quality.ORIGINAL,
      url: contentUrl,
      format,
      hasAudio: false,
      hasVideo: false,
      width,
      height,
    });

    // Pinterest image URL resolution: append /originals/ path if not already present.
    if (!contentUrl.includes('/originals/') && contentUrl.includes('/pins/')) {
      const originalsUrl = contentUrl.replace(/\/\d+x\//, '/originals/');
      if (originalsUrl !== contentUrl) {
        variants.push({
          quality: Quality.HIGHEST,
          url: originalsUrl,
          format,
          hasAudio: false,
          hasVideo: false,
          width,
          height,
        });
      }
    }

    return variants;
  }

  // ──────────────────────────────────────────────
  //  Private — Helpers
  // ──────────────────────────────────────────────

  private selectVariant(variants: MediaVariant[], requested: Quality): MediaVariant {
    if (variants.length === 0) {
      throw new Error('No downloadable variants available');
    }

    const exact = variants.find((v) => v.quality === requested);
    if (exact) return exact;

    // Fall back: prefer ORIGINAL > HIGHEST > first available.
    const fallback =
      variants.find((v) => v.quality === Quality.ORIGINAL) ??
      variants.find((v) => v.quality === Quality.HIGHEST) ??
      variants[0];

    return fallback;
  }

  private async downloadFile(url: string, destPath: string): Promise<number> {
    const ua = this.randomUserAgent();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Referer: 'https://www.pinterest.com/',
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

  private isVideoUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('.mp4') ||
      lower.includes('.mov') ||
      lower.includes('.webm') ||
      lower.includes('video') ||
      lower.includes('/vid/')
    );
  }

  private detectVideoFormat(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.webm')) return 'webm';
    return 'mp4';
  }

  private detectImageFormat(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.webp')) return 'webp';
    return 'jpg';
  }

  private extensionForFormat(format: string): string {
    const map: Record<string, string> = {
      mp4: '.mp4',
      mov: '.mov',
      webm: '.webm',
      jpg: '.jpg',
      jpeg: '.jpg',
      png: '.png',
      webp: '.webp',
    };
    return map[format.toLowerCase()] ?? `.${format}`;
  }

  private randomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Parse ISO 8601 duration (e.g. "PT1M30S") to seconds.
   */
  private parseIso8601Duration(iso: string): number | undefined {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return undefined;

    const hours = parseInt(match[1] ?? '0', 10);
    const minutes = parseInt(match[2] ?? '0', 10);
    const seconds = parseInt(match[3] ?? '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }
}
