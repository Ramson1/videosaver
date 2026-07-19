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
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Rotating User-Agent pool for LinkedIn requests.
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
 * LinkedIn platform adapter.
 *
 * Supports:
 * - Public video posts
 * - Public image posts
 *
 * Limitations:
 * - Only public (non-authenticated) content is accessible.
 * - LinkedIn aggressively rate-limits and serves CAPTCHAs to automated clients.
 * - Video posts use HLS or progressive MP4; we prefer progressive MP4 when available.
 *
 * Extraction strategy:
 * 1. Parse post URN / activity ID from the URL.
 * 2. Fetch the public post page and extract embedded JSON (React initial state /
 *    og:video meta tags).
 * 3. Parse video/image URLs from the extracted data.
 * 4. Download the selected variant.
 */
@Injectable()
export class LinkedInAdapter extends PlatformAdapter {
  private readonly logger = new Logger(LinkedInAdapter.name);

  readonly name: string = Platform.LINKEDIN;
  readonly displayName: string = 'LinkedIn';

  readonly urlPatterns: RegExp[] = [
    /^https?:\/\/(www\.)?linkedin\.com\/(posts?|pulse|feed\/urn)\/.+/i,
    /^https?:\/\/(www\.)?linkedin\.com\/.*[?&]urn=urn:li/i,
  ];

  // ──────────────────────────────────────────────
  //  Availability
  // ──────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch('https://www.linkedin.com/', {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': this.randomUserAgent() },
      });
      clearTimeout(timer);

      return response.ok || response.status === 302 || response.status === 999;
    } catch (error) {
      this.logger.warn(`LinkedIn unreachable: ${(error as Error).message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  //  URL Parsing
  // ──────────────────────────────────────────────

  parseUrl(url: string): ParsedUrl {
    const base: ParsedUrl = {
      originalUrl: url,
      platform: Platform.LINKEDIN,
      mediaId: '',
      normalizedUrl: url,
      isValid: false,
    };

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');

      if (host !== 'linkedin.com') {
        return { ...base, error: `Unrecognised LinkedIn host: ${host}` };
      }

      const pathname = parsed.pathname;

      // Pattern 1: /posts/<author-urn>/<activity-urn>
      // e.g. /posts/johndoe/activity-7123456789012345678
      const postActivityMatch = pathname.match(
        /\/posts\/[^/]+\/(?:activity-)?(\d{16,20})/,
      );
      if (postActivityMatch) {
        return {
          ...base,
          mediaId: postActivityMatch[1],
          normalizedUrl: `https://www.linkedin.com/posts/activity-${postActivityMatch[1]}`,
          isValid: true,
        };
      }

      // Pattern 2: /post/<urn> or /posts/<urn>
      // e.g. /post/urn:li:activity:7123456789012345678
      const urnMatch = pathname.match(/\/posts?\/(urn:li[^/?#]+)/i);
      if (urnMatch) {
        const urn = urnMatch[1];
        const id = this.extractIdFromUrn(urn);
        return {
          ...base,
          mediaId: id ?? urn,
          normalizedUrl: `https://www.linkedin.com/posts/${urn}`,
          isValid: true,
        };
      }

      // Pattern 3: /pulse/<slug> (LinkedIn articles — may contain embedded media).
      const pulseMatch = pathname.match(/\/pulse\/([^/?#]+)/);
      if (pulseMatch) {
        return {
          ...base,
          mediaId: `pulse:${pulseMatch[1]}`,
          normalizedUrl: `https://www.linkedin.com/pulse/${pulseMatch[1]}`,
          isValid: true,
        };
      }

      // Pattern 4: /feed/urn:li:...
      const feedUrnMatch = pathname.match(/\/feed\/(urn:li[^/?#]+)/i);
      if (feedUrnMatch) {
        const urn = feedUrnMatch[1];
        const id = this.extractIdFromUrn(urn);
        return {
          ...base,
          mediaId: id ?? urn,
          normalizedUrl: `https://www.linkedin.com/feed/${urn}`,
          isValid: true,
        };
      }

      // Pattern 5: Query parameter urn=...
      const urnParam = parsed.searchParams.get('urn');
      if (urnParam && urnParam.startsWith('urn:li')) {
        const id = this.extractIdFromUrn(urnParam);
        return {
          ...base,
          mediaId: id ?? urnParam,
          normalizedUrl: url,
          isValid: true,
        };
      }

      // Pattern 6: Generic numeric ID in path (legacy URLs).
      const numericMatch = pathname.match(/\/(\d{16,20})/);
      if (numericMatch) {
        return {
          ...base,
          mediaId: numericMatch[1],
          normalizedUrl: `https://www.linkedin.com/posts/activity-${numericMatch[1]}`,
          isValid: true,
        };
      }

      return { ...base, error: 'Could not extract post/activity ID from LinkedIn URL' };
    } catch {
      return { ...base, error: 'Invalid URL format' };
    }
  }

  // ──────────────────────────────────────────────
  //  Metadata Extraction
  // ──────────────────────────────────────────────

  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    if (!parsedUrl.isValid) {
      throw new Error(`Cannot extract metadata from invalid URL: ${parsedUrl.error}`);
    }

    this.logger.debug(`Extracting metadata for LinkedIn post ${parsedUrl.mediaId}`);

    const pageData = await this.fetchPostPage(parsedUrl.normalizedUrl);
    return this.buildMetadata(pageData, parsedUrl);
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
        `LinkedIn post ${parsedUrl.mediaId} is not downloadable: ${metadata.restrictionReason ?? 'unknown'}`,
      );
    }

    const variant = this.selectVariant(metadata.variants, quality);
    const extension = this.extensionForFormat(variant.format);
    const fileName = `linkedin_${parsedUrl.mediaId}${extension}`;
    const filePath = path.join(outputDir, fileName);

    this.logger.log(`Downloading LinkedIn post ${parsedUrl.mediaId} → ${filePath}`);

    const fileSize = await this.downloadFile(variant.url, filePath);

    return {
      jobId: crypto.randomUUID(),
      platform: Platform.LINKEDIN,
      mediaId: parsedUrl.mediaId,
      title: metadata.title,
      quality: variant.quality,
      filePath,
      fileSize,
      format: variant.format,
      thumbnailPath: metadata.thumbnailUrl
        ? (await this.downloadThumbnail(
            metadata.thumbnailUrl,
            path.join(outputDir, `linkedin_${parsedUrl.mediaId}_thumb.jpg`),
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
    return [MediaType.VIDEO, MediaType.IMAGE];
  }

  // ──────────────────────────────────────────────
  //  Private — Page Fetch
  // ──────────────────────────────────────────────

  /**
   * Fetch the public LinkedIn post page and extract embedded media data.
   *
   * LinkedIn serves public posts with og: meta tags and sometimes embedded
   * React state. We try multiple extraction strategies.
   */
  private async fetchPostPage(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const ua = this.randomUserAgent();

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          // LinkedIn sometimes blocks requests without these headers.
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      // LinkedIn returns 999 for rate-limited requests.
      if (response.status === 999) {
        throw new Error('LinkedIn rate-limited this request (HTTP 999). Try again later.');
      }

      if (!response.ok) {
        throw new Error(`LinkedIn page returned HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parsePostPageHtml(html);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Failed to fetch LinkedIn post page: ${message}`);
      throw new Error(`Failed to fetch LinkedIn post: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse the LinkedIn post page HTML to extract media data.
   * Tries multiple strategies in order of reliability.
   */
  private parsePostPageHtml(html: string): any {
    // Strategy 1: og:video meta tags (most reliable for public video posts).
    const ogVideo = this.extractOgProperty(html, 'og:video:url')
      ?? this.extractOgProperty(html, 'og:video:secure_url');

    if (ogVideo) {
      return {
        type: 'video',
        videoUrl: ogVideo,
        thumbnailUrl: this.extractOgProperty(html, 'og:image'),
        title: this.extractOgProperty(html, 'og:title') ?? '',
        description: this.extractOgProperty(html, 'og:description') ?? '',
        author: this.extractOgProperty(html, 'og:article:author') ?? '',
        width: this.extractOgProperty(html, 'og:video:width')
          ? Number(this.extractOgProperty(html, 'og:video:width'))
          : undefined,
        height: this.extractOgProperty(html, 'og:video:height')
          ? Number(this.extractOgProperty(html, 'og:video:height'))
          : undefined,
      };
    }

    // Strategy 2: og:image (for image-only posts).
    const ogImage = this.extractOgProperty(html, 'og:image');
    if (ogImage) {
      return {
        type: 'image',
        imageUrl: ogImage,
        title: this.extractOgProperty(html, 'og:title') ?? '',
        description: this.extractOgProperty(html, 'og:description') ?? '',
        author: this.extractOgProperty(html, 'og:article:author') ?? '',
      };
    }

    // Strategy 3: JSON-LD structured data.
    const jsonLdMatch = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        return this.parseJsonLd(data);
      } catch {
        // Continue.
      }
    }

    // Strategy 4: Look for video URLs in inline scripts (React state).
    const videoInScript = html.match(
      /["'](?:videoUrl|playableUrl|url)["']\s*:\s*["'](https?:\/\/[^"']*\.mp4[^"']*)/i,
    );
    if (videoInScript) {
      return {
        type: 'video',
        videoUrl: videoInScript[1].replace(/&amp;/g, '&'),
        thumbnailUrl: this.extractOgProperty(html, 'og:image'),
        title: this.extractOgProperty(html, 'og:title') ?? '',
        description: this.extractOgProperty(html, 'og:description') ?? '',
        author: '',
      };
    }

    return { type: 'unknown', title: '', description: '' };
  }

  private extractOgProperty(html: string, property: string): string | undefined {
    // Match both <meta property="..." content="..."> and <meta content="..." property="...">
    const pattern1 = new RegExp(
      `<meta[^>]*property=["']${this.escapeRegex(property)}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
    const pattern2 = new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${this.escapeRegex(property)}["']`,
      'i',
    );

    const match = html.match(pattern1) ?? html.match(pattern2);
    return match?.[1]
      ? match[1].replace(/&amp;/g, '&').replace(/&#x2F;/g, '/').replace(/&quot;/g, '"')
      : undefined;
  }

  private parseJsonLd(data: any): any {
    const contentUrl: string | undefined = data.contentUrl ?? data.embedUrl;
    const isVideo = data['@type'] === 'VideoObject' || (contentUrl && this.isVideoUrl(contentUrl));

    if (isVideo) {
      return {
        type: 'video',
        videoUrl: contentUrl,
        thumbnailUrl: data.thumbnailUrl,
        title: data.name ?? '',
        description: data.description ?? '',
        author: data.author?.name ?? '',
        width: data.width ? Number(data.width) : undefined,
        height: data.height ? Number(data.height) : undefined,
        duration: data.duration ? this.parseIso8601Duration(data.duration) : undefined,
      };
    }

    return {
      type: 'image',
      imageUrl: data.thumbnailUrl ?? contentUrl,
      title: data.name ?? '',
      description: data.description ?? '',
      author: data.author?.name ?? '',
    };
  }

  // ──────────────────────────────────────────────
  //  Private — Metadata Builder
  // ──────────────────────────────────────────────

  private buildMetadata(pageData: any, parsedUrl: ParsedUrl): MediaMetadata {
    const isVideo = pageData.type === 'video';
    const mediaType = isVideo ? MediaType.VIDEO : MediaType.IMAGE;
    const variants = this.buildVariants(pageData);

    const hasMedia = variants.length > 0;

    return {
      platform: Platform.LINKEDIN,
      mediaId: parsedUrl.mediaId,
      title: pageData.title || `LinkedIn Post ${parsedUrl.mediaId}`,
      description: pageData.description || undefined,
      author: {
        name: pageData.author || 'Unknown',
      },
      thumbnailUrl: pageData.thumbnailUrl,
      duration: pageData.duration,
      mediaType,
      variants,
      sourceUrl: parsedUrl.normalizedUrl,
      isDownloadable: hasMedia,
      restrictionReason: !hasMedia
        ? 'No public media found — post may be private or contain no downloadable media'
        : undefined,
      extractedAt: new Date(),
    };
  }

  private buildVariants(pageData: any): MediaVariant[] {
    if (pageData.type === 'video' && pageData.videoUrl) {
      return this.buildVideoVariants(pageData);
    }

    if (pageData.type === 'image' && pageData.imageUrl) {
      return this.buildImageVariants(pageData);
    }

    return [];
  }

  private buildVideoVariants(pageData: any): MediaVariant[] {
    const videoUrl: string = pageData.videoUrl;
    const width = pageData.width;
    const height = pageData.height;

    // LinkedIn serves progressive MP4 or HLS. Prefer progressive.
    if (videoUrl.includes('.mp4') || videoUrl.includes('mp4')) {
      const quality = this.resolutionToQuality(height);
      return [
        {
          quality,
          url: videoUrl,
          format: 'mp4',
          hasAudio: true,
          hasVideo: true,
          width,
          height,
        },
      ];
    }

    // HLS manifest — still provide as a variant but note the format.
    return [
      {
        quality: Quality.HIGHEST,
        url: videoUrl,
        format: 'm3u8',
        hasAudio: true,
        hasVideo: true,
        width,
        height,
      },
    ];
  }

  private buildImageVariants(pageData: any): MediaVariant[] {
    const imageUrl: string = pageData.imageUrl;
    const format = this.detectImageFormat(imageUrl);

    return [
      {
        quality: Quality.ORIGINAL,
        url: imageUrl,
        format,
        hasAudio: false,
        hasVideo: false,
      },
    ];
  }

  // ──────────────────────────────────────────────
  //  Private — Helpers
  // ──────────────────────────────────────────────

  /**
   * Extract a numeric ID from a LinkedIn URN.
   * e.g. "urn:li:activity:7123456789012345678" → "7123456789012345678"
   */
  private extractIdFromUrn(urn: string): string | undefined {
    const match = urn.match(/:(\d{16,20})$/);
    return match?.[1];
  }

  private selectVariant(variants: MediaVariant[], requested: Quality): MediaVariant {
    if (variants.length === 0) {
      throw new Error('No downloadable variants available');
    }

    const exact = variants.find((v) => v.quality === requested);
    if (exact) return exact;

    // Prefer non-HLS variants when available.
    const mp4 = variants.find((v) => v.format === 'mp4');
    if (mp4) return mp4;

    return variants[0];
  }

  private resolutionToQuality(height?: number): Quality {
    if (!height) return Quality.HIGHEST;
    if (height >= 1080) return Quality.P1080;
    if (height >= 720) return Quality.P720;
    if (height >= 480) return Quality.P480;
    return Quality.P360;
  }

  private async downloadFile(url: string, destPath: string): Promise<number> {
    const ua = this.randomUserAgent();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Referer: 'https://www.linkedin.com/',
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
    return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('video');
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
      m3u8: '.ts',
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

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
