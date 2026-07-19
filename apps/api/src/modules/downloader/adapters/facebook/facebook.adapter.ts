import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
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
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0',
];

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Maximum number of redirect hops to follow. */
const MAX_REDIRECTS = 5;

@Injectable()
export class FacebookAdapter extends PlatformAdapter {
  readonly name = Platform.FACEBOOK;
  readonly displayName = 'Facebook';

  readonly urlPatterns: RegExp[] = [
    /^https?:\/\/(www\.)?facebook\.com\//i,
    /^https?:\/\/(m|web)\.facebook\.com\//i,
    /^https?:\/\/fb\.watch\//i,
    /^https?:\/\/(www\.)?facebook\.com\/watch\//i,
    /^https?:\/\/(www\.)?facebook\.com\/reel\//i,
    /^https?:\/\/(www\.)?facebook\.com\/share\//i,
  ];

  private readonly logger = new Logger(FacebookAdapter.name);
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
      const response = await this.fetchWithTimeout('https://www.facebook.com', {
        method: 'HEAD',
        signal: AbortSignal.timeout(8_000),
      });
      return response.ok || response.status === 302;
    } catch {
      this.logger.warn('Facebook is not reachable');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // URL parsing
  // ---------------------------------------------------------------------------

  parseUrl(url: string): ParsedUrl {
    const base: ParsedUrl = {
      originalUrl: url,
      platform: Platform.FACEBOOK,
      mediaId: '',
      normalizedUrl: url,
      isValid: false,
    };

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace(/^(m|web)\./, 'www.');
      parsed.hostname = hostname;

      // fb.watch short links --------------------------------------------------
      if (parsed.hostname === 'fb.watch') {
        const shortCode = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        if (!shortCode) {
          return { ...base, error: 'Invalid fb.watch URL: missing short code' };
        }
        return {
          ...base,
          mediaId: shortCode,
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // Standard facebook.com URLs --------------------------------------------
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      // /videos/<id>  or  /video/<id>
      const videoMatch = parsed.pathname.match(/\/(?:videos?|reel|watch)\/(\d+)/);
      if (videoMatch) {
        return {
          ...base,
          mediaId: videoMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /<user>/posts/<id>  or  /<user>/videos/<id>
      const postMatch = parsed.pathname.match(/\/[^/]+\/(?:posts|videos)\/(\d+)/);
      if (postMatch) {
        return {
          ...base,
          mediaId: postMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /<user>/photos/...  or  photo ID from query
      const photoMatch =
        parsed.pathname.match(/\/[^/]+\/photos\/[^/]*?(\d{10,})/) ??
        parsed.pathname.match(/\/photo\.php\?fbid=(\d+)/);
      if (photoMatch) {
        return {
          ...base,
          mediaId: photoMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /<id> bare numeric path (e.g. facebook.com/1234567890)
      if (pathParts.length === 1 && /^\d{5,}$/.test(pathParts[0])) {
        return {
          ...base,
          mediaId: pathParts[0],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // /share/r/<id>
      const shareMatch = parsed.pathname.match(/\/share\/[a-z]\/(\d+)/i);
      if (shareMatch) {
        return {
          ...base,
          mediaId: shareMatch[1],
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      // Fallback: use v=<id> query param
      const vParam = parsed.searchParams.get('v');
      if (vParam && /^\d+$/.test(vParam)) {
        return {
          ...base,
          mediaId: vParam,
          normalizedUrl: parsed.toString(),
          isValid: true,
        };
      }

      return { ...base, error: 'Could not extract media ID from Facebook URL' };
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
          this.logger.debug(`yt-dlp extracted ${metadata.variants.length} variants for Facebook`);
          return metadata;
        }
        this.logger.debug('yt-dlp returned no variants, falling back to scraping');
      } catch (err) {
        this.logger.warn(`yt-dlp failed for Facebook: ${(err as Error).message} — falling back to scraping`);
      }
    }

    // --- Fallback: Original scraping approach ---
    const notDownloadable: MediaMetadata = {
      platform: Platform.FACEBOOK,
      mediaId: parsedUrl.mediaId,
      title: '',
      author: { name: 'Unknown' },
      mediaType: MediaType.VIDEO,
      variants: [],
      sourceUrl: parsedUrl.normalizedUrl,
      isDownloadable: false,
      restrictionReason: 'Unknown error during metadata extraction',
      extractedAt: new Date(),
    };

    try {
      // Resolve fb.watch short links first
      let resolvedUrl = parsedUrl.normalizedUrl;
      if (new URL(resolvedUrl).hostname === 'fb.watch') {
        resolvedUrl = await this.resolveRedirect(resolvedUrl);
        this.logger.debug(`Resolved short URL to: ${resolvedUrl}`);
      }

      const html = await this.fetchPageHtml(resolvedUrl);

      // --- og:title ----------------------------------------------------------
      const title =
        this.extractOgTag(html, 'og:title') ??
        this.extractMetaContent(html, 'title') ??
        'Facebook Video';

      // --- og:description ----------------------------------------------------
      const description =
        this.extractOgTag(html, 'og:description') ?? undefined;

      // --- og:image (thumbnail) ----------------------------------------------
      const thumbnailUrl = this.extractOgTag(html, 'og:image') ?? undefined;

      // --- Author info -------------------------------------------------------
      const authorName =
        this.extractOgTag(html, 'og:article:author') ??
        this.extractMetaContent(html, 'author') ??
        this.extractJsonLdAuthor(html) ??
        'Unknown';

      const profileUrl =
        this.extractLinkRel(html, 'canonical') ?? undefined;

      // --- Duration ----------------------------------------------------------
      const duration = this.extractVideoDuration(html);

      // --- Media type --------------------------------------------------------
      const mediaType = this.detectMediaType(html, resolvedUrl);

      // --- Video variants ----------------------------------------------------
      const variants = this.extractVideoVariants(html);

      // --- Photo variant (if image post) -------------------------------------
      if (mediaType === MediaType.IMAGE) {
        const imageUrl =
          this.extractOgTag(html, 'og:image') ??
          this.extractLargestImage(html);
        if (imageUrl) {
          variants.push({
            quality: Quality.ORIGINAL,
            url: imageUrl,
            format: this.detectImageFormat(imageUrl),
            hasAudio: false,
            hasVideo: false,
          });
        }
      }

      const isDownloadable = variants.length > 0;
      const restrictionReason = isDownloadable
        ? undefined
        : this.extractRestrictionReason(html);

      return {
        platform: Platform.FACEBOOK,
        mediaId: parsedUrl.mediaId,
        title,
        description,
        author: {
          name: authorName,
          profileUrl,
        },
        thumbnailUrl,
        duration,
        mediaType,
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
      platform: Platform.FACEBOOK,
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
    // <meta property="og:title" content="..." />
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

  private extractLinkRel(html: string, rel: string): string | null {
    const pattern = new RegExp(`<link[^>]+rel=["']${this.escapeRegex(rel)}["'][^>]+href=["']([^"']*)["']`, 'i');
    const match = html.match(pattern);
    return match?.[1] ?? null;
  }

  private extractJsonLdAuthor(html: string): string | null {
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!jsonLdMatch?.[1]) return null;

    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data.author?.name) return data.author.name;
      if (Array.isArray(data) && data[0]?.author?.name) return data[0].author.name;
    } catch {
      // malformed JSON-LD — ignore
    }
    return null;
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

    return undefined;
  }

  private detectMediaType(html: string, url: string): MediaType {
    const ogType = this.extractOgTag(html, 'og:type') ?? '';

    if (/video/i.test(ogType) || /\/videos?\//i.test(url) || /\/reel\//i.test(url) || /\/watch/i.test(url)) {
      return MediaType.VIDEO;
    }

    if (/photo/i.test(ogType) || /\/photos\//i.test(url) || /photo\.php/i.test(url)) {
      return MediaType.IMAGE;
    }

    // Default to video for Facebook — most shared content is video
    return MediaType.VIDEO;
  }

  /**
   * Extract video download URLs from Facebook page data.
   *
   * Facebook embeds video URLs in several places within the page source:
   * 1. `browser_native_hd_url` / `browser_native_sd_url` in relay data
   * 2. `video_url` or `hd_src` / `sd_src` in embedded JSON
   * 3. Direct MP4 links in script blocks
   */
  private extractVideoVariants(html: string): MediaVariant[] {
    const variants: MediaVariant[] = [];
    const seen = new Set<string>();

    const addVariant = (
      url: string,
      quality: Quality,
      height?: number,
    ): void => {
      const cleanUrl = url.replace(/&amp;/g, '&');
      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);

      variants.push({
        quality,
        url: cleanUrl,
        format: 'mp4',
        hasAudio: true,
        hasVideo: true,
        width: height ? Math.round(height * (16 / 9)) : undefined,
        height,
      });
    };

    // 1. HD native URL
    const hdMatch = html.match(/browser_native_hd_url["']\s*:\s*["'](https?:[^"']+)["']/);
    if (hdMatch?.[1]) {
      addVariant(hdMatch[1], Quality.P1080, 1080);
    }

    // 2. SD native URL
    const sdMatch = html.match(/browser_native_sd_url["']\s*:\s*["'](https?:[^"']+)["']/);
    if (sdMatch?.[1]) {
      addVariant(sdMatch[1], Quality.P480, 480);
    }

    // 3. hd_src / sd_src from embedded data
    const hdSrc = html.match(/hd_src["']\s*:\s*["'](https?:[^"']+)["']/);
    if (hdSrc?.[1]) {
      addVariant(hdSrc[1], Quality.P720, 720);
    }

    const sdSrc = html.match(/sd_src["']\s*:\s*["'](https?:[^"']+)["']/);
    if (sdSrc?.[1]) {
      addVariant(sdSrc[1], Quality.P480, 480);
    }

    // 4. Generic video_url field
    const videoUrl = html.match(/video_url["']\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/);
    if (videoUrl?.[1]) {
      addVariant(videoUrl[1], Quality.HIGHEST);
    }

    // 5. Direct MP4 links in data URLs
    const mp4Pattern = /https?:\\?\/\\?\/[^"'\s]+\.mp4[^"'\s]*/g;
    const mp4Matches = html.match(mp4Pattern);
    if (mp4Matches) {
      for (const raw of mp4Matches) {
        const decoded = raw
          .replace(/\\\//g, '/')
          .replace(/&amp;/g, '&')
          .replace(/\\u0025/g, '%');
        if (!seen.has(decoded) && decoded.includes('.mp4')) {
          addVariant(decoded, Quality.ORIGINAL);
        }
      }
    }

    return variants;
  }

  private extractLargestImage(html: string): string | null {
    // og:image:width + og:image pairs
    const widthMatch = html.match(/og:image:width["']\s+content=["'](\d+)["']/i);
    const imageMatch = this.extractOgTag(html, 'og:image');
    if (imageMatch && widthMatch) return imageMatch;
    return imageMatch;
  }

  private detectImageFormat(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.webp')) return 'webp';
    if (lower.includes('.gif')) return 'gif';
    return 'jpg';
  }

  private extractRestrictionReason(html: string): string {
    if (/log.?in/i.test(html) && /sign.?up/i.test(html) && html.length < 5000) {
      return 'Login required to access this content';
    }
    if (/this content is currently unavailable/i.test(html)) {
      return 'Content is currently unavailable';
    }
    if (/this content is no longer available/i.test(html)) {
      return 'Content is no longer available';
    }
    if (/restricted/i.test(html)) {
      return 'Content is restricted';
    }
    if (/private/i.test(html) && /post/i.test(html)) {
      return 'This is a private post';
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
