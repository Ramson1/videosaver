import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, extname } from 'path';

import { PlatformAdapter } from '../platform-adapter';
import { YtdlpService } from '../../services/ytdlp.service';
import {
  DownloadResult,
  MediaMetadata,
  MediaType,
  MediaVariant,
  ParsedUrl,
  Platform,
  Quality,
} from '@common/interfaces/platform.interface';

/**
 * Rotating pool of desktop browser User-Agent strings.
 * Rotated per-request to reduce fingerprinting and rate-limit triggers.
 */
const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Maximum number of redirect hops to follow. */
const MAX_REDIRECTS = 5;

@Injectable()
export class InstagramAdapter extends PlatformAdapter {
  readonly name = Platform.INSTAGRAM;
  readonly displayName = 'Instagram';

  readonly urlPatterns: RegExp[] = [
    /^https?:\/\/(www\.)?instagram\.com\//i,
    /^https?:\/\/instagr\.am\//i,
  ];

  private readonly logger = new Logger(InstagramAdapter.name);
  private uaIndex = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly ytdlpService: YtdlpService,
  ) {
    super();
  }

  // ---------------------------------------------------------------------------
  // Availability
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout('https://www.instagram.com', {
        method: 'HEAD',
        signal: AbortSignal.timeout(8_000),
      });
      return response.ok || response.status === 302;
    } catch {
      this.logger.warn('Instagram is not reachable');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // URL parsing
  // ---------------------------------------------------------------------------

  parseUrl(url: string): ParsedUrl {
    const base: ParsedUrl = {
      originalUrl: url,
      platform: Platform.INSTAGRAM,
      mediaId: '',
      normalizedUrl: url,
      isValid: false,
    };

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace(/^(m|www)\./, 'www.');
      parsed.hostname = hostname;

      // instagr.am short domain
      if (parsed.hostname === 'instagr.am') {
        const shortCode = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        if (!shortCode) {
          return { ...base, error: 'Invalid instagr.am URL: missing short code' };
        }
        return {
          ...base,
          mediaId: shortCode,
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /p/<shortcode> — standard post
      const postMatch = parsed.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
      if (postMatch) {
        return {
          ...base,
          mediaId: postMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /reel/<shortcode> or /reels/<shortcode>
      const reelMatch = parsed.pathname.match(/\/reels?\/([A-Za-z0-9_-]+)/);
      if (reelMatch) {
        return {
          ...base,
          mediaId: reelMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /tv/<shortcode> — IGTV
      const tvMatch = parsed.pathname.match(/\/tv\/([A-Za-z0-9_-]+)/);
      if (tvMatch) {
        return {
          ...base,
          mediaId: tvMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /stories/<username>/<storyId>
      const storyMatch = parsed.pathname.match(/\/stories\/[^/]+\/(\d+)/);
      if (storyMatch) {
        return {
          ...base,
          mediaId: storyMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      return { ...base, error: 'Could not extract media ID from Instagram URL' };
    } catch {
      return { ...base, error: 'Malformed URL' };
    }
  }

  // ---------------------------------------------------------------------------
  // Metadata extraction
  // ---------------------------------------------------------------------------

  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    // --- Primary: Use yt-dlp if available ---
    if (this.ytdlpService.isAvailable()) {
      try {
        const metadata = await this.ytdlpService.buildMetadata(parsedUrl.originalUrl);
        if (metadata && metadata.variants.length > 0) {
          this.logger.debug(`yt-dlp extracted ${metadata.variants.length} variants for Instagram`);
          return metadata;
        }
        this.logger.debug('yt-dlp returned no variants, falling back to scraping');
      } catch (err) {
        this.logger.warn(`yt-dlp failed for Instagram: ${(err as Error).message} — falling back to scraping`);
      }
    }

    // --- Fallback: Original scraping approach ---
    const notDownloadable: MediaMetadata = {
      platform: Platform.INSTAGRAM,
      mediaId: parsedUrl.mediaId,
      title: '',
      author: { name: 'Unknown' },
      mediaType: MediaType.IMAGE,
      variants: [],
      sourceUrl: parsedUrl.normalizedUrl,
      isDownloadable: false,
      restrictionReason: 'Unknown error during metadata extraction',
      extractedAt: new Date(),
    };

    try {
      // Resolve instagr.am short links
      let resolvedUrl = parsedUrl.normalizedUrl;
      if (new URL(resolvedUrl).hostname === 'instagr.am') {
        resolvedUrl = await this.resolveRedirect(resolvedUrl);
        this.logger.debug(`Resolved short URL to: ${resolvedUrl}`);
      }

      const html = await this.fetchPageHtml(resolvedUrl);

      // --- og:title ----------------------------------------------------------
      const title =
        this.extractOgTag(html, 'og:title') ??
        this.extractMetaContent(html, 'title') ??
        'Instagram Post';

      // --- og:description ----------------------------------------------------
      const description =
        this.extractOgTag(html, 'og:description') ?? undefined;

      // --- og:image (thumbnail) ----------------------------------------------
      const thumbnailUrl = this.extractOgTag(html, 'og:image') ?? undefined;

      // --- Author info -------------------------------------------------------
      const authorName =
        this.extractOgTag(html, 'og:article:author') ??
        this.extractUsernameFromUrl(resolvedUrl) ??
        this.extractJsonLdAuthor(html) ??
        'Unknown';

      const profileUrl = authorName !== 'Unknown'
        ? `https://www.instagram.com/${authorName}/`
        : undefined;

      // --- Duration (for videos/reels) ---------------------------------------
      const duration = this.extractVideoDuration(html);

      // --- Media type --------------------------------------------------------
      const mediaType = this.detectMediaType(html, resolvedUrl);

      // --- Media variants ----------------------------------------------------
      const variants = this.extractMediaVariants(html, mediaType);

      // --- Carousel detection ------------------------------------------------
      const carouselItems = this.extractCarouselItems(html);
      if (carouselItems.length > 1) {
        // For carousels, add each item as a variant
        for (const item of carouselItems) {
          const alreadyExists = variants.some((v) => v.url === item.url);
          if (!alreadyExists) {
            variants.push(item);
          }
        }
      }

      const isDownloadable = variants.length > 0;
      const restrictionReason = isDownloadable
        ? undefined
        : this.extractRestrictionReason(html);

      return {
        platform: Platform.INSTAGRAM,
        mediaId: parsedUrl.mediaId,
        title,
        description,
        author: {
          name: authorName,
          username: authorName !== 'Unknown' ? authorName : undefined,
          profileUrl,
        },
        thumbnailUrl,
        duration,
        mediaType: carouselItems.length > 1 ? MediaType.CAROUSEL : mediaType,
        variants,
        sourceUrl: resolvedUrl,
        isDownloadable,
        restrictionReason,
        extractedAt: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Metadata extraction failed: ${message}`);
      return { ...notDownloadable, restrictionReason: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  async download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult> {
    this.logger.log(`Downloading ${parsedUrl.mediaId} at quality=${quality}`);

    const metadata = await this.extractMetadata(parsedUrl);

    if (!metadata.isDownloadable) {
      throw new Error(
        `Content is not downloadable: ${metadata.restrictionReason ?? 'unknown reason'}`,
      );
    }

    // Pick the best matching variant
    const variant = this.selectVariant(metadata.variants, quality);
    if (!variant) {
      throw new Error(`No variant available for quality=${quality}`);
    }

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    const extension = extname(variant.url.split('?')[0]) || this.extensionForFormat(variant.format);
    const safeTitle = this.sanitizeFilename(metadata.title).slice(0, 80);
    const fileName = `${parsedUrl.mediaId}_${safeTitle}${extension}`;
    const filePath = join(outputDir, fileName);

    // Stream the download
    const fileSize = await this.downloadFile(variant.url, filePath);

    // Optionally download thumbnail
    let thumbnailPath: string | undefined;
    if (metadata.thumbnailUrl) {
      thumbnailPath = join(outputDir, `${parsedUrl.mediaId}_thumb.jpg`);
      await this.downloadFile(metadata.thumbnailUrl, thumbnailPath).catch(() => undefined);
    }

    const now = new Date();
    const signedUrlExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      jobId: randomUUID(),
      platform: Platform.INSTAGRAM,
      mediaId: parsedUrl.mediaId,
      title: metadata.title,
      quality: variant.quality,
      filePath,
      fileSize,
      format: variant.format,
      thumbnailPath,
      storageUrl: filePath,
      signedUrl: filePath, // local file — signed URL populated by storage service
      signedUrlExpiresAt: signedUrlExpires,
      duration: metadata.duration,
      completedAt: now,
    };
  }

  // ---------------------------------------------------------------------------
  // Supported types
  // ---------------------------------------------------------------------------

  getSupportedTypes(): string[] {
    return [
      MediaType.VIDEO,
      MediaType.IMAGE,
      MediaType.CAROUSEL,
      MediaType.GIF,
    ];
  }

  // ---------------------------------------------------------------------------
  // Private helpers — HTTP
  // ---------------------------------------------------------------------------

  private nextUserAgent(): string {
    const ua = USER_AGENTS[this.uaIndex % USER_AGENTS.length];
    this.uaIndex++;
    return ua;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'User-Agent': this.nextUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(init.headers as Record<string, string>),
      };

      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Follow redirects manually up to MAX_REDIRECTS to resolve short URLs.
   */
  private async resolveRedirect(url: string, hops = 0): Promise<string> {
    if (hops >= MAX_REDIRECTS) return url;

    const response = await this.fetchWithTimeout(url, { redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        const next = new URL(location, url).toString();
        return this.resolveRedirect(next, hops + 1);
      }
    }

    return response.url || url;
  }

  /**
   * Fetch a page and return its HTML body.
   */
  private async fetchPageHtml(url: string): Promise<string> {
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when fetching ${url}`);
    }

    return response.text();
  }

  // ---------------------------------------------------------------------------
  // Private helpers — HTML parsing
  // ---------------------------------------------------------------------------

  private extractOgTag(html: string, property: string): string | null {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${this.escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${this.escapeRegex(property)}["']`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return this.decodeHtmlEntities(match[1]);
    }
    return null;
  }

  private extractMetaContent(html: string, name: string): string | null {
    const patterns = [
      new RegExp(`<meta[^>]+name=["']${this.escapeRegex(name)}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${this.escapeRegex(name)}["']`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return this.decodeHtmlEntities(match[1]);
    }
    return null;
  }

  private extractJsonLdAuthor(html: string): string | null {
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!jsonLdMatch?.[1]) return null;

    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data.author?.name) return data.author.name;
      if (Array.isArray(data) && data[0]?.author?.name) return data[0].author.name;
      // Instagram sometimes uses creator field
      if (data.creator?.name) return data.creator.name;
    } catch {
      // malformed JSON-LD — ignore
    }
    return null;
  }

  private extractUsernameFromUrl(url: string): string | null {
    const match = url.match(/instagram\.com\/([A-Za-z0-9_.]+)\/(?:p|reel|tv)\//);
    return match?.[1] ?? null;
  }

  private extractVideoDuration(html: string): number | undefined {
    const ogDuration = this.extractOgTag(html, 'og:video:duration');
    if (ogDuration) {
      const parsed = parseInt(ogDuration, 10);
      if (!isNaN(parsed)) return parsed;
    }

    // Look for duration in embedded JSON data
    const durationMatch = html.match(/["']duration["']\s*:\s*(\d+(?:\.\d+)?)/);
    if (durationMatch) {
      const parsed = parseFloat(durationMatch[1]);
      if (!isNaN(parsed)) return Math.round(parsed);
    }

    // video_duration field in Instagram's shared data
    const videoDurationMatch = html.match(/video_duration["']\s*:\s*(\d+(?:\.\d+)?)/);
    if (videoDurationMatch) {
      const parsed = parseFloat(videoDurationMatch[1]);
      if (!isNaN(parsed)) return Math.round(parsed);
    }

    return undefined;
  }

  private detectMediaType(html: string, url: string): MediaType {
    const ogType = this.extractOgTag(html, 'og:type') ?? '';

    if (/video/i.test(ogType) || /\/reel/i.test(url) || /\/tv\//i.test(url)) {
      return MediaType.VIDEO;
    }

    // Instagram defaults to image for /p/ posts unless video data is found
    const hasVideo = /video_url/i.test(html) || /video_versions/i.test(html);
    if (hasVideo) {
      return MediaType.VIDEO;
    }

    return MediaType.IMAGE;
  }

  /**
   * Extract media download URLs from Instagram page data.
   *
   * Instagram embeds media data in several places:
   * 1. og:video / og:video:url meta tags
   * 2. `video_url` in embedded JSON / shared data
   * 3. `video_versions` array with multiple quality levels
   * 4. `display_resources` for images at various sizes
   * 5. `carousel_media` for multi-image/video posts
   */
  private extractMediaVariants(html: string, mediaType: MediaType): MediaVariant[] {
    const variants: MediaVariant[] = [];
    const seen = new Set<string>();

    const addVariant = (
      url: string,
      quality: Quality,
      format: string,
      opts: { hasAudio?: boolean; hasVideo?: boolean; width?: number; height?: number } = {},
    ): void => {
      const cleanUrl = url.replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);

      variants.push({
        quality,
        url: cleanUrl,
        format,
        hasAudio: opts.hasAudio ?? (mediaType === MediaType.VIDEO),
        hasVideo: opts.hasVideo ?? (mediaType !== MediaType.IMAGE),
        width: opts.width,
        height: opts.height,
      });
    };

    // 1. og:video URL
    const ogVideo = this.extractOgTag(html, 'og:video') ?? this.extractOgTag(html, 'og:video:url');
    if (ogVideo) {
      addVariant(ogVideo, Quality.HIGHEST, 'mp4');
    }

    // 2. video_url from embedded data
    const videoUrlMatch = html.match(/video_url["']\s*:\s*["'](https?:[^"']+)["']/);
    if (videoUrlMatch?.[1]) {
      addVariant(videoUrlMatch[1], Quality.HIGHEST, 'mp4');
    }

    // 3. video_versions array — Instagram provides multiple quality levels
    const videoVersionsPattern = /video_versions["']\s*:\s*\[([\s\S]*?)\]/;
    const videoVersionsMatch = html.match(videoVersionsPattern);
    if (videoVersionsMatch?.[1]) {
      this.parseVideoVersions(videoVersionsMatch[1], addVariant);
    }

    // 4. Image display_resources
    if (mediaType === MediaType.IMAGE || variants.length === 0) {
      const displayResources = this.extractDisplayResources(html);
      for (const resource of displayResources) {
        addVariant(
          resource.url,
          resource.quality,
          this.detectImageFormat(resource.url),
          { hasAudio: false, hasVideo: false, width: resource.width, height: resource.height },
        );
      }

      // og:image as fallback for images
      const ogImage = this.extractOgTag(html, 'og:image');
      if (ogImage && variants.length === 0) {
        addVariant(ogImage, Quality.ORIGINAL, this.detectImageFormat(ogImage), {
          hasAudio: false,
          hasVideo: false,
        });
      }
    }

    return variants;
  }

  /**
   * Parse Instagram's video_versions array entries.
   */
  private parseVideoVersions(
    versionsBlock: string,
    addVariant: (url: string, quality: Quality, format: string, opts?: { hasAudio?: boolean; hasVideo?: boolean; width?: number; height?: number }) => void,
  ): void {
    // Extract individual version objects
    const typePattern = /type["']\s*:\s*(\d+)/g;
    const urlPattern = /url["']\s*:\s*["'](https?:[^"']+)["']/g;
    const widthPattern = /width["']\s*:\s*(\d+)/g;
    const heightPattern = /height["']\s*:\s*(\d+)/g;

    const urls: string[] = [];
    const widths: number[] = [];
    const heights: number[] = [];
    const types: number[] = [];

    let m: RegExpExecArray | null;
    while ((m = urlPattern.exec(versionsBlock)) !== null) urls.push(m[1]);
    while ((m = widthPattern.exec(versionsBlock)) !== null) widths.push(parseInt(m[1], 10));
    while ((m = heightPattern.exec(versionsBlock)) !== null) heights.push(parseInt(m[1], 10));
    while ((m = typePattern.exec(versionsBlock)) !== null) types.push(parseInt(m[1], 10));

    for (let i = 0; i < urls.length; i++) {
      const height = heights[i];
      let quality: Quality;

      if (height >= 1080) quality = Quality.P1080;
      else if (height >= 720) quality = Quality.P720;
      else if (height >= 480) quality = Quality.P480;
      else quality = Quality.P360;

      addVariant(urls[i], quality, 'mp4', {
        hasAudio: true,
        hasVideo: true,
        width: widths[i],
        height,
      });
    }
  }

  /**
   * Extract display_resources for image posts.
   */
  private extractDisplayResources(html: string): Array<{ url: string; quality: Quality; width: number; height: number }> {
    const resources: Array<{ url: string; quality: Quality; width: number; height: number }> = [];

    const resourcesPattern = /display_resources["']\s*:\s*\[([\s\S]*?)\]/;
    const match = html.match(resourcesPattern);
    if (!match?.[1]) return resources;

    const block = match[1];
    const srcPattern = /src["']\s*:\s*["'](https?:[^"']+)["']/g;
    const configPattern = /config_width["']\s*:\s*(\d+)/g;

    const urls: string[] = [];
    const widths: number[] = [];

    let m: RegExpExecArray | null;
    while ((m = srcPattern.exec(block)) !== null) urls.push(m[1]);
    while ((m = configPattern.exec(block)) !== null) widths.push(parseInt(m[1], 10));

    for (let i = 0; i < urls.length; i++) {
      const width = widths[i] ?? 0;
      let quality: Quality;

      if (width >= 1080) quality = Quality.P1080;
      else if (width >= 720) quality = Quality.P720;
      else if (width >= 480) quality = Quality.P480;
      else quality = Quality.P360;

      resources.push({ url: urls[i], quality, width, height: 0 });
    }

    return resources;
  }

  /**
   * Extract carousel_media items — Instagram posts with multiple images/videos.
   */
  private extractCarouselItems(html: string): MediaVariant[] {
    const items: MediaVariant[] = [];

    // Look for carousel_media in the embedded data
    const carouselPattern = /carousel_media["']\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/;
    const match = html.match(carouselPattern);
    if (!match?.[1]) return items;

    const block = match[1];

    // Extract each item's video_url or display_url
    const videoUrlPattern = /video_url["']\s*:\s*["'](https?:[^"']+)["']/g;
    const displayUrlPattern = /display_url["']\s*:\s*["'](https?:[^"']+)["']/g;

    let m: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((m = videoUrlPattern.exec(block)) !== null) {
      const url = m[1].replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
      if (!seen.has(url)) {
        seen.add(url);
        items.push({
          quality: Quality.ORIGINAL,
          url,
          format: 'mp4',
          hasAudio: true,
          hasVideo: true,
        });
      }
    }

    while ((m = displayUrlPattern.exec(block)) !== null) {
      const url = m[1].replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
      if (!seen.has(url)) {
        seen.add(url);
        items.push({
          quality: Quality.ORIGINAL,
          url,
          format: this.detectImageFormat(url),
          hasAudio: false,
          hasVideo: false,
        });
      }
    }

    return items;
  }

  private extractRestrictionReason(html: string): string {
    if (/log.?in/i.test(html) && /sign.?up/i.test(html) && html.length < 5000) {
      return 'Login required to access this content';
    }
    if (/this page is not available/i.test(html)) {
      return 'This page is not available';
    }
    if (/sorry, this post is private/i.test(html) || /private account/i.test(html)) {
      return 'This is a private account or post';
    }
    if (/content is no longer available/i.test(html)) {
      return 'Content is no longer available';
    }
    if (/rate limit/i.test(html) || /too many requests/i.test(html)) {
      return 'Rate limited by Instagram — please try again later';
    }
    return 'No downloadable media found on page';
  }

  // ---------------------------------------------------------------------------
  // Private helpers — variant selection & file I/O
  // ---------------------------------------------------------------------------

  private selectVariant(variants: MediaVariant[], quality: Quality): MediaVariant | null {
    if (variants.length === 0) return null;

    const qualityOrder: Quality[] = [
      Quality.ORIGINAL,
      Quality.HIGHEST,
      Quality.P1080,
      Quality.P720,
      Quality.P480,
      Quality.P360,
    ];

    // Exact match first
    const exact = variants.find((v) => v.quality === quality);
    if (exact) return exact;

    // Find closest quality
    const requestedIdx = qualityOrder.indexOf(quality);
    if (requestedIdx === -1) return variants[0];

    // Try higher quality first, then lower
    for (let i = requestedIdx - 1; i >= 0; i--) {
      const match = variants.find((v) => v.quality === qualityOrder[i]);
      if (match) return match;
    }
    for (let i = requestedIdx + 1; i < qualityOrder.length; i++) {
      const match = variants.find((v) => v.quality === qualityOrder[i]);
      if (match) return match;
    }

    return variants[0];
  }

  private async downloadFile(url: string, destPath: string): Promise<number> {
    const response = await this.fetchWithTimeout(url, {}, 60_000);

    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const writer = createWriteStream(destPath);
    const reader = response.body.getReader();

    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
        totalBytes += value.length;
      }
    } finally {
      writer.end();
    }

    // Wait for write stream to finish
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return totalBytes;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — misc
  // ---------------------------------------------------------------------------

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&apos;/g, "'");
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .trim() || 'untitled';
  }

  private detectImageFormat(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.webp')) return 'webp';
    if (lower.includes('.gif')) return 'gif';
    return 'jpg';
  }

  private extensionForFormat(format: string): string {
    const map: Record<string, string> = {
      mp4: '.mp4',
      webm: '.webm',
      jpg: '.jpg',
      jpeg: '.jpg',
      png: '.png',
      gif: '.gif',
      webp: '.webp',
      mp3: '.mp3',
    };
    return map[format.toLowerCase()] ?? '.mp4';
  }
}
