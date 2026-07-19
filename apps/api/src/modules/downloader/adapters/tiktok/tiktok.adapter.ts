import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

const TIKTOK_URL_PATTERNS: RegExp[] = [
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/i,
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/photo\/\d+/i,
  /^https?:\/\/(www\.)?tiktok\.com\/t\/[\w]+/i,
  /^https?:\/\/vm\.tiktok\.com\/[\w]+/i,
  /^https?:\/\/vt\.tiktok\.com\/[\w]+/i,
  /^https?:\/\/m\.tiktok\.com\/v\/\d+/i,
  /^https?:\/\/(www\.)?tiktok\.com\/embed\/v2\/\d+/i,
];

/** TikTok video ID is always a numeric string (typically 19 digits). */
const TIKTOK_ID_REGEX = /(\d{15,22})/;

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Maximum number of redirects to follow when resolving short URLs. */
const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Perform an HTTP(S) GET request and return the response body as a string.
 * Follows redirects up to `maxRedirects` times. Returns the final URL in
 * `finalUrl` so callers can inspect where a short link resolved to.
 */
function httpGet(
  url: string,
  options: {
    headers?: Record<string, string>;
    maxRedirects?: number;
    timeoutMs?: number;
    followRedirects?: boolean;
  } = {},
): Promise<{ body: string; statusCode: number; finalUrl: string; headers: Record<string, string> }> {
  const {
    headers = {},
    maxRedirects = MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    followRedirects = true,
  } = options;

  return new Promise((resolve, reject) => {
    let redirectCount = 0;

    const doRequest = (currentUrl: string): void => {
      const parsed = new URL(currentUrl);
      const transport = parsed.protocol === 'https:' ? https : http;

      const req = transport.get(
        currentUrl,
        {
          headers: {
            'User-Agent': pickUserAgent(),
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...headers,
          },
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode ?? 0;

          // Handle redirects
          if (followRedirects && status >= 300 && status < 400 && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              reject(new Error(`Exceeded maximum redirects (${maxRedirects})`));
              return;
            }
            const redirectUrl = new URL(res.headers.location, currentUrl).toString();
            doRequest(redirectUrl);
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            const responseHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
              if (typeof value === 'string') {
                responseHeaders[key] = value;
              } else if (Array.isArray(value)) {
                responseHeaders[key] = value.join(', ');
              }
            }
            resolve({ body, statusCode: status, finalUrl: currentUrl, headers: responseHeaders });
          });
          res.on('error', reject);
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      });
      req.on('error', reject);
    };

    doRequest(url);
  });
}

/**
 * Download a binary file to disk. Returns the number of bytes written.
 */
function downloadFile(
  url: string,
  destPath: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<number> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = options;

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.get(url, {
      headers: {
        'User-Agent': pickUserAgent(),
        Accept: '*/*',
        ...headers,
      },
      timeout: timeoutMs,
    });

    const fileStream = fs.createWriteStream(destPath);
    let bytesWritten = 0;

    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        // Follow one redirect for file downloads
        fileStream.close();
        fs.unlinkSync(destPath);
        downloadFile(res.headers.location, destPath, options).then(resolve).catch(reject);
        return;
      }
      if (status < 200 || status >= 300) {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Download failed with status ${status}`));
        return;
      }

      res.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
      });
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve(bytesWritten));
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      fileStream.close();
      fs.unlink(destPath, () => {});
      reject(new Error(`Download timed out after ${timeoutMs}ms`));
    });
    req.on('error', (err) => {
      fileStream.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Extract the first JSON-LD object from an HTML page.
 */
function extractJsonLd(html: string): Record<string, unknown> | null {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const match = regex.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

/**
 * Extract og:* meta tag content from HTML.
 */
function extractOgTag(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const match = regex.exec(html);
  if (match) return match[1];

  // Try reversed attribute order (content before property)
  const reverseRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`,
    'i',
  );
  const reverseMatch = reverseRegex.exec(html);
  return reverseMatch ? reverseMatch[1] : null;
}

/**
 * Extract SIGI_STATE or __UNIVERSAL_DATA_FOR_REHYDRATION__ or similar JSON
 * blobs that TikTok embeds in the page for SSR hydration.
 */
function extractTikTokState(html: string): Record<string, unknown> | null {
  // Try __UNIVERSAL_DATA_FOR_REHYDRATION__ first (current TikTok format)
  const universalMatch = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (universalMatch) {
    try {
      return JSON.parse(universalMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try SIGI_STATE (legacy format)
  const sigiMatch = html.match(
    /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (sigiMatch) {
    try {
      return JSON.parse(sigiMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try __NEXT_DATA__ (another possible format)
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (nextDataMatch) {
    try {
      return JSON.parse(nextDataMatch[1].trim());
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Safely traverse a nested object by dot-separated path.
 */
function deepGet(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === 'object' && acc !== null) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

@Injectable()
export class TikTokAdapter extends PlatformAdapter {
  readonly name = Platform.TIKTOK;
  readonly displayName = 'TikTok';
  readonly urlPatterns = TIKTOK_URL_PATTERNS;

  private readonly logger = new Logger(TikTokAdapter.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ytdlpService: YtdlpService,
  ) {
    super();
  }

  // -------------------------------------------------------------------------
  // PlatformAdapter interface
  // -------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const { statusCode } = await httpGet('https://www.tiktok.com/', {
        timeoutMs: 8_000,
        maxRedirects: 3,
      });
      return statusCode >= 200 && statusCode < 500;
    } catch (error) {
      this.logger.warn(`TikTok availability check failed: ${(error as Error).message}`);
      return false;
    }
  }

  parseUrl(url: string): ParsedUrl {
    const trimmed = url.trim();

    if (!this.canHandle(trimmed)) {
      return {
        originalUrl: trimmed,
        platform: Platform.TIKTOK,
        mediaId: '',
        normalizedUrl: trimmed,
        isValid: false,
        error: 'URL does not match any known TikTok URL pattern',
      };
    }

    // Short URLs (vm.tiktok.com, vt.tiktok.com, /t/) need redirect resolution
    // to extract the video ID. We mark them as valid but without a mediaId
    // until extractMetadata resolves the redirect.
    const isShortUrl =
      /vm\.tiktok\.com/i.test(trimmed) ||
      /vt\.tiktok\.com/i.test(trimmed) ||
      /tiktok\.com\/t\//i.test(trimmed);

    if (isShortUrl) {
      return {
        originalUrl: trimmed,
        platform: Platform.TIKTOK,
        mediaId: '', // resolved later
        normalizedUrl: trimmed,
        isValid: true,
      };
    }

    const idMatch = trimmed.match(TIKTOK_ID_REGEX);
    if (!idMatch) {
      return {
        originalUrl: trimmed,
        platform: Platform.TIKTOK,
        mediaId: '',
        normalizedUrl: trimmed,
        isValid: false,
        error: 'Could not extract TikTok video ID from URL',
      };
    }

    const mediaId = idMatch[1];
    const normalizedUrl = `https://www.tiktok.com/_/item/${mediaId}`;

    return {
      originalUrl: trimmed,
      platform: Platform.TIKTOK,
      mediaId,
      normalizedUrl,
      isValid: true,
    };
  }

  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    this.logger.debug(`Extracting metadata for TikTok URL: ${parsedUrl.originalUrl}`);

    // --- Primary: Use yt-dlp if available ---
    if (this.ytdlpService.isAvailable()) {
      try {
        const metadata = await this.ytdlpService.buildMetadata(parsedUrl.originalUrl);
        if (metadata && metadata.variants.length > 0) {
          this.logger.debug(`yt-dlp extracted ${metadata.variants.length} variants for TikTok`);
          return metadata;
        }
        this.logger.debug('yt-dlp returned no variants, falling back to scraping');
      } catch (err) {
        this.logger.warn(`yt-dlp failed for TikTok: ${(err as Error).message} — falling back to scraping`);
      }
    }

    // --- Fallback: Original scraping approach ---

    // Resolve short URLs to their canonical form
    let resolvedUrl = parsedUrl.normalizedUrl;
    let mediaId = parsedUrl.mediaId;

    if (!mediaId) {
      const resolved = await this.resolveShortUrl(parsedUrl.originalUrl);
      resolvedUrl = resolved.resolvedUrl;
      mediaId = resolved.mediaId;

      if (!mediaId) {
        throw new Error(
          `Failed to extract TikTok video ID from resolved URL: ${resolvedUrl}`,
        );
      }
    }

    // Fetch the page HTML
    const { body: html, finalUrl } = await httpGet(resolvedUrl, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      headers: {
        Cookie: 'tt_webid=1; tt_webid_v2=1',
        Referer: 'https://www.tiktok.com/',
      },
    });

    if (!html || html.length < 500) {
      throw new Error('Received empty or too-short response from TikTok');
    }

    this.logger.debug(`Fetched ${html.length} bytes from ${finalUrl}`);

    // --- Extract metadata from multiple sources ---

    const ogTitle = extractOgTag(html, 'title');
    const ogDescription = extractOgTag(html, 'description');
    const ogImage = extractOgTag(html, 'image');
    const ogVideo = extractOgTag(html, 'video');
    const ogVideoUrl = extractOgTag(html, 'video:url');

    const jsonLd = extractJsonLd(html);
    const stateData = extractTikTokState(html);

    // Attempt to extract detailed video info from embedded state
    const videoInfo = this.extractVideoInfoFromState(stateData, mediaId);

    // Determine media type
    const mediaType = this.determineMediaType(html, videoInfo, ogVideo);

    // Build variants
    const variants = this.buildVariants(ogVideoUrl, ogVideo, videoInfo, mediaType);

    // Author info
    const author = this.extractAuthor(html, videoInfo, stateData);

    // Title
    const title: string =
      (videoInfo?.desc as string | undefined) ||
      ogTitle ||
      (jsonLd ? (jsonLd['name'] as string) : null) ||
      'TikTok Video';

    // Description
    const description: string | undefined = (videoInfo?.desc as string | undefined) || ogDescription || undefined;

    // Thumbnail
    const thumbnailUrl: string | undefined =
      (videoInfo?.cover as string | undefined) ||
      (videoInfo?.originCover as string | undefined) ||
      ogImage ||
      (jsonLd ? (jsonLd['thumbnailUrl'] as string) : null) ||
      undefined;

    // Duration
    const duration = videoInfo?.duration ? Number(videoInfo.duration) : undefined;

    // Check downloadability
    const isDownloadable = variants.length > 0;
    const restrictionReason = !isDownloadable
      ? 'No downloadable video variants found. The content may be private, region-locked, or removed.'
      : undefined;

    return {
      platform: Platform.TIKTOK,
      mediaId,
      title,
      description,
      author,
      thumbnailUrl,
      duration,
      mediaType,
      variants,
      sourceUrl: parsedUrl.originalUrl,
      isDownloadable,
      restrictionReason,
      extractedAt: new Date(),
    };
  }

  async download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult> {
    this.logger.debug(
      `Downloading TikTok ${parsedUrl.mediaId} at quality ${quality}`,
    );

    const metadata = await this.extractMetadata(parsedUrl);

    if (!metadata.isDownloadable || metadata.variants.length === 0) {
      throw new Error(
        `Content is not downloadable: ${metadata.restrictionReason ?? 'no variants available'}`,
      );
    }

    // Select the best variant for the requested quality
    const variant = this.selectVariant(metadata.variants, quality);

    if (!variant) {
      throw new Error(`No variant matching quality "${quality}" found`);
    }

    // Prepare output path
    const sanitizedTitle = this.sanitizeFilename(metadata.title);
    const extension = variant.format || 'mp4';
    const fileName = `tiktok_${metadata.mediaId}_${sanitizedTitle}.${extension}`;
    const filePath = path.join(outputDir, fileName);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Download the file
    const fileSize = await downloadFile(variant.url, filePath, {
      timeoutMs: 60_000,
      headers: {
        Referer: 'https://www.tiktok.com/',
      },
    });

    this.logger.debug(
      `Downloaded ${fileSize} bytes to ${filePath}`,
    );

    // Download thumbnail if available
    let thumbnailPath: string | undefined;
    if (metadata.thumbnailUrl) {
      thumbnailPath = path.join(outputDir, `tiktok_${metadata.mediaId}_thumb.jpg`);
      try {
        await downloadFile(metadata.thumbnailUrl, thumbnailPath, {
          timeoutMs: 15_000,
        });
      } catch (err) {
        this.logger.warn(`Failed to download thumbnail: ${(err as Error).message}`);
        thumbnailPath = undefined;
      }
    }

    const now = new Date();
    const signedUrlExpiry = new Date(
      now.getTime() +
        (this.configService.get<number>('app.storage.signedUrlExpirySeconds') ?? 3600) * 1000,
    );

    return {
      jobId: crypto.randomUUID(),
      platform: Platform.TIKTOK,
      mediaId: metadata.mediaId,
      title: metadata.title,
      quality: variant.quality,
      filePath,
      fileSize,
      format: variant.format,
      thumbnailPath,
      storageUrl: '', // populated by the orchestrator after upload
      signedUrl: '',  // populated by the orchestrator
      signedUrlExpiresAt: signedUrlExpiry,
      duration: metadata.duration,
      completedAt: now,
    };
  }

  getSupportedTypes(): string[] {
    return [MediaType.VIDEO, MediaType.IMAGE, MediaType.CAROUSEL];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve a TikTok short URL (vm.tiktok.com, vt.tiktok.com, /t/) to
   * its canonical form and extract the video ID.
   */
  private async resolveShortUrl(
    url: string,
  ): Promise<{ resolvedUrl: string; mediaId: string }> {
    this.logger.debug(`Resolving TikTok short URL: ${url}`);

    try {
      const { finalUrl } = await httpGet(url, {
        timeoutMs: 10_000,
        maxRedirects: MAX_REDIRECTS,
        followRedirects: true,
      });

      const idMatch = finalUrl.match(TIKTOK_ID_REGEX);
      const mediaId = idMatch ? idMatch[1] : '';

      this.logger.debug(
        `Resolved short URL to: ${finalUrl} (mediaId: ${mediaId || 'not found'})`,
      );

      return { resolvedUrl: finalUrl, mediaId };
    } catch (error) {
      this.logger.warn(
        `Failed to resolve TikTok short URL: ${(error as Error).message}`,
      );
      return { resolvedUrl: url, mediaId: '' };
    }
  }

  /**
   * Attempt to extract detailed video information from TikTok's embedded
   * state data (UNIVERSAL_DATA, SIGI_STATE, or __NEXT_DATA__).
   */
  private extractVideoInfoFromState(
    stateData: Record<string, unknown> | null,
    mediaId: string,
  ): Record<string, unknown> | null {
    if (!stateData) return null;

    // __UNIVERSAL_DATA_FOR_REHYDRATION__ structure
    const defaultScope = deepGet(stateData, '__DEFAULT_SCOPE__') as Record<string, unknown>;
    if (defaultScope) {
      const webappVideoDetail = deepGet(
        defaultScope,
        'webapp.video-detail',
      ) as Record<string, unknown>;
      if (webappVideoDetail?.itemInfo) {
        return deepGet(webappVideoDetail, 'itemInfo.itemStruct') as Record<string, unknown>;
      }
      if (webappVideoDetail?.videoData) {
        return webappVideoDetail.videoData as Record<string, unknown>;
      }
    }

    // SIGI_STATE structure (legacy)
    const itemModule = deepGet(stateData, 'ItemModule') as Record<string, unknown>;
    if (itemModule && itemModule[mediaId]) {
      return itemModule[mediaId] as Record<string, unknown>;
    }

    // __NEXT_DATA__ structure
    const props = deepGet(stateData, 'props.pageProps') as Record<string, unknown>;
    if (props) {
      const itemInfo = deepGet(props, 'itemInfo.itemStruct') as Record<string, unknown>;
      if (itemInfo) return itemInfo;

      // Alternative: direct video data
      const videoData = deepGet(props, 'videoData') as Record<string, unknown>;
      if (videoData) return videoData;
    }

    return null;
  }

  /**
   * Determine whether the content is a video, image, or slideshow/carousel.
   */
  private determineMediaType(
    html: string,
    videoInfo: Record<string, unknown> | null,
    ogVideo: string | null,
  ): MediaType {
    // Check state data for image post / slideshow indicators
    if (videoInfo) {
      const images = videoInfo['imagePost'] as Record<string, unknown> | undefined;
      if (images) return MediaType.CAROUSEL;

      const images2 = videoInfo['images'] as unknown[] | undefined;
      if (images2 && images2.length > 0) return MediaType.CAROUSEL;
    }

    // Check HTML for image post markers
    if (html.includes('"imagePost"') || html.includes('"images":[')) {
      // Could be a slideshow
      if (html.includes('"video":{') || ogVideo) {
        return MediaType.VIDEO;
      }
      return MediaType.IMAGE;
    }

    // Default to video for standard TikTok URLs
    if (ogVideo || html.includes('og:video')) {
      return MediaType.VIDEO;
    }

    return MediaType.VIDEO;
  }

  /**
   * Build a list of downloadable variants from the available data sources.
   */
  private buildVariants(
    ogVideoUrl: string | null,
    ogVideo: string | null,
    videoInfo: Record<string, unknown> | null,
    mediaType: MediaType,
  ): MediaVariant[] {
    const variants: MediaVariant[] = [];
    const seenUrls = new Set<string>();

    const addVariant = (v: MediaVariant): void => {
      if (v.url && !seenUrls.has(v.url)) {
        seenUrls.add(v.url);
        variants.push(v);
      }
    };

    // Extract from videoInfo state data (most detailed)
    if (videoInfo) {
      const video = videoInfo['video'] as Record<string, unknown> | undefined;
      if (video) {
        // PlayAddr (watermarked)
        const playAddr = video['playAddr'] as string | undefined;
        if (playAddr) {
          addVariant({
            quality: Quality.HIGHEST,
            url: playAddr,
            format: 'mp4',
            hasAudio: true,
            hasVideo: true,
            width: (video['width'] as number) || undefined,
            height: (video['height'] as number) || undefined,
          });
        }

        // DownloadAddr (often watermark-free)
        const downloadAddr = video['downloadAddr'] as string | undefined;
        if (downloadAddr) {
          addVariant({
            quality: Quality.ORIGINAL,
            url: downloadAddr,
            format: 'mp4',
            hasAudio: true,
            hasVideo: true,
            width: (video['width'] as number) || undefined,
            height: (video['height'] as number) || undefined,
          });
        }

        // Bitrate-based variants
        const bitrateInfo = video['bitrateInfo'] as Array<Record<string, unknown>> | undefined;
        if (bitrateInfo && Array.isArray(bitrateInfo)) {
          for (const info of bitrateInfo) {
            const playUrl = deepGet(info, 'PlayAddr.UrlList.0') as string | undefined;
            if (playUrl) {
              const qualityStr = (info['QualityType'] as string) || '';
              let quality = Quality.P720;
              if (qualityStr.includes('1080') || qualityStr.includes('normal')) {
                quality = Quality.P1080;
              } else if (qualityStr.includes('720')) {
                quality = Quality.P720;
              } else if (qualityStr.includes('540') || qualityStr.includes('480')) {
                quality = Quality.P480;
              } else if (qualityStr.includes('360')) {
                quality = Quality.P360;
              }

              addVariant({
                quality,
                url: playUrl,
                format: 'mp4',
                hasAudio: true,
                hasVideo: true,
              });
            }
          }
        }
      }

      // Image post variants
      if (mediaType === MediaType.CAROUSEL || mediaType === MediaType.IMAGE) {
        const imagePost = videoInfo['imagePost'] as Record<string, unknown> | undefined;
        const images = (imagePost?.['images'] ?? videoInfo['images']) as
          Array<Record<string, unknown>> | undefined;
        if (images && Array.isArray(images)) {
          for (let i = 0; i < images.length; i++) {
            const imgUrl =
              (deepGet(images[i], 'urlList.0') as string) ||
              (deepGet(images[i], 'downloadUrlList.0') as string);
            if (imgUrl) {
              addVariant({
                quality: Quality.ORIGINAL,
                url: imgUrl,
                format: 'jpeg',
                hasAudio: false,
                hasVideo: false,
              });
            }
          }
        }
      }
    }

    // Fallback: og:video:url
    if (ogVideoUrl) {
      addVariant({
        quality: Quality.HIGHEST,
        url: ogVideoUrl,
        format: 'mp4',
        hasAudio: true,
        hasVideo: true,
      });
    }

    // Fallback: og:video
    if (ogVideo && ogVideo !== ogVideoUrl) {
      addVariant({
        quality: Quality.HIGHEST,
        url: ogVideo,
        format: 'mp4',
        hasAudio: true,
        hasVideo: true,
      });
    }

    return variants;
  }

  /**
   * Extract author information from HTML or embedded state.
   */
  private extractAuthor(
    html: string,
    videoInfo: Record<string, unknown> | null,
    stateData: Record<string, unknown> | null,
  ): { name: string; username?: string; avatarUrl?: string; profileUrl?: string } {
    // From videoInfo state
    if (videoInfo) {
      const author = videoInfo['author'] as Record<string, unknown> | undefined;
      if (author) {
        return {
          name: (author['nickname'] as string) || (author['uniqueId'] as string) || 'Unknown',
          username: author['uniqueId'] as string | undefined,
          avatarUrl: author['avatarLarger'] as string | undefined,
          profileUrl: author['uniqueId']
            ? `https://www.tiktok.com/@${author['uniqueId']}`
            : undefined,
        };
      }
    }

    // From og:title (format: "@username on TikTok: ...")
    const ogTitle = extractOgTag(html, 'title');
    if (ogTitle) {
      const usernameMatch = ogTitle.match(/@([\w.-]+)/);
      if (usernameMatch) {
        const username = usernameMatch[1];
        return {
          name: username,
          username,
          profileUrl: `https://www.tiktok.com/@${username}`,
        };
      }
    }

    // From JSON-LD
    const jsonLd = extractJsonLd(html);
    if (jsonLd) {
      const authorName = jsonLd['author'] as Record<string, unknown> | string | undefined;
      if (typeof authorName === 'string') {
        return { name: authorName };
      }
      if (authorName && typeof authorName === 'object') {
        return { name: (authorName['name'] as string) || 'Unknown' };
      }
    }

    return { name: 'Unknown' };
  }

  /**
   * Select the best variant matching the requested quality.
   */
  private selectVariant(variants: MediaVariant[], quality: Quality): MediaVariant | null {
    if (variants.length === 0) return null;

    // Exact match
    const exact = variants.find((v) => v.quality === quality);
    if (exact) return exact;

    // Quality hierarchy for fallback
    const qualityOrder: Quality[] = [
      Quality.ORIGINAL,
      Quality.HIGHEST,
      Quality.P1080,
      Quality.P720,
      Quality.P480,
      Quality.P360,
    ];

    const requestedIndex = qualityOrder.indexOf(quality);
    if (requestedIndex === -1) {
      // audio_only or unknown -- return first available
      return variants[0];
    }

    // Find closest quality at or below the requested level
    for (let i = requestedIndex; i < qualityOrder.length; i++) {
      const match = variants.find((v) => v.quality === qualityOrder[i]);
      if (match) return match;
    }

    // If nothing at or below, return the first available
    return variants[0];
  }

  /**
   * Sanitize a string for use as a filename.
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 80)
      .toLowerCase();
  }
}
