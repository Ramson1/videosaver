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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

const YOUTUBE_URL_PATTERNS: RegExp[] = [
  // Standard watch URLs
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/i,
  // Shorts
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]{11}/i,
  // Embed URLs
  /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]{11}/i,
  // Mobile URLs
  /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]{11}/i,
  /^https?:\/\/m\.youtube\.com\/shorts\/[\w-]{11}/i,
  // youtu.be short URLs
  /^https?:\/\/youtu\.be\/[\w-]{11}/i,
  // YouTube Music (may be restricted)
  /^https?:\/\/music\.youtube\.com\/watch\?v=[\w-]{11}/i,
  // Live URLs
  /^https?:\/\/(www\.)?youtube\.com\/live\/[\w-]{11}/i,
];

/** YouTube video IDs are exactly 11 characters of [A-Za-z0-9_-]. */
const YOUTUBE_VIDEO_ID_REGEX = /([\w-]{11})/;

/** oEmbed endpoint for metadata retrieval. */
const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Perform an HTTP(S) GET request. Follows redirects up to `maxRedirects`.
 */
function httpGet(
  url: string,
  options: {
    headers?: Record<string, string>;
    maxRedirects?: number;
    timeoutMs?: number;
  } = {},
): Promise<{ body: string; statusCode: number; finalUrl: string; headers: Record<string, string> }> {
  const {
    headers = {},
    maxRedirects = MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
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
            Accept: 'application/json, text/html, */*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...headers,
          },
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode ?? 0;

          if (status >= 300 && status < 400 && res.headers.location) {
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
 * Download a binary file to disk. Returns bytes written.
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
        fileStream.close();
        fs.unlinkSync(destPath);
        downloadFile(res.headers.location, destPath, options).then(resolve).catch(reject);
        return;
      }
      if (status < 200 || status >= 300) {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Download failed with HTTP status ${status}`));
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
 * Extract og:* meta tag content from HTML.
 */
function extractOgTag(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const match = regex.exec(html);
  if (match) return match[1];

  const reverseRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`,
    'i',
  );
  const reverseMatch = reverseRegex.exec(html);
  return reverseMatch ? reverseMatch[1] : null;
}

/**
 * Extract the first JSON-LD object from HTML.
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

// ---------------------------------------------------------------------------
// oEmbed response shape
// ---------------------------------------------------------------------------

interface OEmbedResponse {
  type?: string;
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

@Injectable()
export class YouTubeAdapter extends PlatformAdapter {
  readonly name = Platform.YOUTUBE;
  readonly displayName = 'YouTube';
  readonly urlPatterns = YOUTUBE_URL_PATTERNS;

  private readonly logger = new Logger(YouTubeAdapter.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  // -------------------------------------------------------------------------
  // PlatformAdapter interface
  // -------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const { statusCode } = await httpGet('https://www.youtube.com/', {
        timeoutMs: 8_000,
        maxRedirects: 3,
      });
      return statusCode >= 200 && statusCode < 500;
    } catch (error) {
      this.logger.warn(`YouTube availability check failed: ${(error as Error).message}`);
      return false;
    }
  }

  parseUrl(url: string): ParsedUrl {
    const trimmed = url.trim();

    if (!this.canHandle(trimmed)) {
      return {
        originalUrl: trimmed,
        platform: Platform.YOUTUBE,
        mediaId: '',
        normalizedUrl: trimmed,
        isValid: false,
        error: 'URL does not match any known YouTube URL pattern',
      };
    }

    const mediaId = this.extractVideoId(trimmed);

    if (!mediaId) {
      return {
        originalUrl: trimmed,
        platform: Platform.YOUTUBE,
        mediaId: '',
        normalizedUrl: trimmed,
        isValid: false,
        error: 'Could not extract YouTube video ID from URL',
      };
    }

    const normalizedUrl = `https://www.youtube.com/watch?v=${mediaId}`;

    return {
      originalUrl: trimmed,
      platform: Platform.YOUTUBE,
      mediaId,
      normalizedUrl,
      isValid: true,
    };
  }

  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    this.logger.debug(`Extracting metadata for YouTube URL: ${parsedUrl.originalUrl}`);

    if (!parsedUrl.isValid || !parsedUrl.mediaId) {
      throw new Error('Cannot extract metadata from invalid URL');
    }

    const mediaId = parsedUrl.mediaId;

    // --- Step 1: Fetch oEmbed data (public, legal, no auth required) ---
    const oembed = await this.fetchOEmbed(mediaId);

    // --- Step 2: Fetch the watch page to check for restrictions ---
    const restrictionInfo = await this.checkRestrictions(mediaId);

    // Determine if the content is downloadable.
    // We mark content as NOT downloadable when:
    //   - It is age-restricted / requires login
    //   - It is private / unlisted with no public access
    //   - It has been removed or is region-blocked
    //   - It is a live stream (not a VOD)
    //
    // YouTube's Terms of Service restrict automated downloading of content
    // unless a download button/link is explicitly provided by YouTube.
    // This adapter provides metadata retrieval via the public oEmbed API
    // and only attempts downloads where legally permitted.
    const isDownloadable = restrictionInfo.isDownloadable;
    const restrictionReason = restrictionInfo.reason;

    // Build variants from the page data (if downloadable)
    const variants = isDownloadable
      ? await this.buildVariants(mediaId)
      : [];

    // Determine media type
    const isShort = this.isShortUrl(parsedUrl.originalUrl);
    const mediaType = MediaType.VIDEO;

    // Author info from oEmbed
    const author = {
      name: oembed?.author_name ?? 'Unknown',
      username: oembed?.author_url
        ? this.extractChannelHandle(oembed.author_url)
        : undefined,
      profileUrl: oembed?.author_url ?? undefined,
    };

    return {
      platform: Platform.YOUTUBE,
      mediaId,
      title: oembed?.title ?? 'YouTube Video',
      author,
      thumbnailUrl: oembed?.thumbnail_url ?? undefined,
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
      `Downloading YouTube ${parsedUrl.mediaId} at quality ${quality}`,
    );

    const metadata = await this.extractMetadata(parsedUrl);

    if (!metadata.isDownloadable) {
      throw new Error(
        `Content is not downloadable: ${metadata.restrictionReason ?? 'restricted by platform'}. ` +
        'YouTube content may only be downloaded where explicitly permitted by YouTube ' +
        'and in compliance with their Terms of Service.',
      );
    }

    if (metadata.variants.length === 0) {
      throw new Error(
        'No downloadable variants available. The content may be protected or ' +
        'not available for download through this service.',
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
    const fileName = `youtube_${metadata.mediaId}_${sanitizedTitle}.${extension}`;
    const filePath = path.join(outputDir, fileName);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Download the file
    const fileSize = await downloadFile(variant.url, filePath, {
      timeoutMs: 120_000, // YouTube files can be large
      headers: {
        Referer: 'https://www.youtube.com/',
      },
    });

    this.logger.debug(`Downloaded ${fileSize} bytes to ${filePath}`);

    // Download thumbnail if available
    let thumbnailPath: string | undefined;
    if (metadata.thumbnailUrl) {
      thumbnailPath = path.join(outputDir, `youtube_${metadata.mediaId}_thumb.jpg`);
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
      platform: Platform.YOUTUBE,
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
    return [MediaType.VIDEO];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Extract the 11-character video ID from various YouTube URL formats.
   */
  private extractVideoId(url: string): string | null {
    // youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([\w-]{11})/i);
    if (shortMatch) return shortMatch[1];

    // ?v=VIDEO_ID
    const paramMatch = url.match(/[?&]v=([\w-]{11})/i);
    if (paramMatch) return paramMatch[1];

    // /shorts/VIDEO_ID
    const shortsMatch = url.match(/shorts\/([\w-]{11})/i);
    if (shortsMatch) return shortsMatch[1];

    // /embed/VIDEO_ID
    const embedMatch = url.match(/embed\/([\w-]{11})/i);
    if (embedMatch) return embedMatch[1];

    // /live/VIDEO_ID
    const liveMatch = url.match(/live\/([\w-]{11})/i);
    if (liveMatch) return liveMatch[1];

    return null;
  }

  /**
   * Fetch metadata from YouTube's public oEmbed API.
   * This is a legal, public endpoint that does not require authentication.
   * See: https://www.youtube.com/oembed
   */
  private async fetchOEmbed(videoId: string): Promise<OEmbedResponse | null> {
    const url = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;

    try {
      const { body, statusCode } = await httpGet(url, {
        timeoutMs: 10_000,
        headers: { Accept: 'application/json' },
      });

      if (statusCode !== 200) {
        this.logger.debug(
          `oEmbed returned status ${statusCode} for video ${videoId}`,
        );
        return null;
      }

      return JSON.parse(body) as OEmbedResponse;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch oEmbed for ${videoId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Check the YouTube watch page for content restrictions.
   *
   * Returns whether the content appears downloadable and a human-readable
   * reason string when it is not.
   *
   * IMPORTANT: This check is based on publicly available signals in the page
   * HTML. It does NOT circumvent any access controls or DRM.
   */
  private async checkRestrictions(
    videoId: string,
  ): Promise<{ isDownloadable: boolean; reason?: string }> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      const { body: html, statusCode } = await httpGet(watchUrl, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'CONSENT=YES+1',
        },
      });

      // If the page returns a non-200, the video may be removed or unavailable
      if (statusCode === 404 || statusCode === 410) {
        return {
          isDownloadable: false,
          reason: 'Video has been removed or is no longer available (HTTP ' + statusCode + ')',
        };
      }

      if (statusCode < 200 || statusCode >= 500) {
        return {
          isDownloadable: false,
          reason: `YouTube returned an unexpected status code (${statusCode})`,
        };
      }

      // Check for age-restriction / login requirement
      if (
        html.includes('"playabilityStatus":"LOGIN_REQUIRED"') ||
        html.includes('"playabilityStatus":"AGE_VERIFICATION_REQUIRED"') ||
        html.includes('og:restrictions:age') ||
        html.includes('"reason":"Sign in to confirm your age"')
      ) {
        return {
          isDownloadable: false,
          reason: 'Content is age-restricted and requires authentication. ' +
            'Age-gated content cannot be processed through this service.',
        };
      }

      // Check for private video
      if (
        html.includes('"playabilityStatus":"ERROR"') &&
        (html.includes('"reason":"Video unavailable"') ||
         html.includes('This video is private'))
      ) {
        return {
          isDownloadable: false,
          reason: 'Video is private and not accessible',
        };
      }

      // Check for region restriction
      if (
        html.includes('"reason":"Video unavailable"') &&
        (html.includes('country') || html.includes('region'))
      ) {
        return {
          isDownloadable: false,
          reason: 'Video is region-restricted and not available in our server location',
        };
      }

      // Check for live content (live streams cannot be downloaded as files)
      if (
        html.includes('"isLive":true') ||
        html.includes('"isLiveContent":true')
      ) {
        // Live content that has ended may become a regular VOD
        if (!html.includes('"isLiveNow":true')) {
          // Live stream has ended, may be available as VOD
          this.logger.debug(`Video ${videoId} was a live stream but is no longer live`);
        } else {
          return {
            isDownloadable: false,
            reason: 'Content is a live stream currently in progress. ' +
              'Live streams cannot be downloaded until they conclude.',
          };
        }
      }

      // Check for "Sign in" requirement
      if (
        html.includes('"playabilityStatus":"LOGIN_REQUIRED"') &&
        !html.includes('"reason":"Sign in to confirm your age"')
      ) {
        return {
          isDownloadable: false,
          reason: 'Content requires authentication to access',
        };
      }

      // Check for paid/premium content
      if (
        html.includes('"isPaidContent":true') ||
        html.includes('Premium') && html.includes('sign in')
      ) {
        return {
          isDownloadable: false,
          reason: 'Content is paid/premium and requires a subscription',
        };
      }

      // Check for DRM / protected content indicators
      if (
        html.includes('"drmFamilies"') ||
        html.includes('content_warning')
      ) {
        return {
          isDownloadable: false,
          reason: 'Content is DRM-protected and cannot be downloaded',
        };
      }

      // Check if the page contains a download button (YouTube provides this
      // for some content via YouTube Premium offline feature)
      // If the playabilityStatus is OK, the video is generally accessible
      if (html.includes('"playabilityStatus":"OK"')) {
        return { isDownloadable: true };
      }

      // If we can't determine the status, err on the side of caution
      this.logger.warn(
        `Could not determine downloadability for ${videoId}; defaulting to restricted`,
      );
      return {
        isDownloadable: false,
        reason: 'Unable to verify content availability status. ' +
          'The video may be restricted or the page format has changed.',
      };
    } catch (error) {
      this.logger.warn(
        `Failed to check restrictions for ${videoId}: ${(error as Error).message}`,
      );
      return {
        isDownloadable: false,
        reason: `Failed to verify content availability: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Build downloadable variants from the YouTube page data.
   *
   * This method attempts to extract stream URLs from the page's embedded
   * player data. If the content is restricted, this returns an empty array.
   *
   * NOTE: YouTube's Terms of Service prohibit downloading content unless
   * a download button is explicitly provided. This method only extracts
   * URLs that are publicly accessible in the page source.
   */
  private async buildVariants(videoId: string): Promise<MediaVariant[]> {
    const variants: MediaVariant[] = [];

    try {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const { body: html } = await httpGet(watchUrl, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'CONSENT=YES+1',
        },
      });

      // Try to extract ytInitialPlayerResponse
      const playerResponseMatch = html.match(
        /var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;/,
      );

      if (!playerResponseMatch) {
        this.logger.debug(`No ytInitialPlayerResponse found for ${videoId}`);
        return variants;
      }

      let playerResponse: Record<string, unknown>;
      try {
        playerResponse = JSON.parse(playerResponseMatch[1]);
      } catch {
        this.logger.warn(`Failed to parse ytInitialPlayerResponse for ${videoId}`);
        return variants;
      }

      // Extract streaming data
      const streamingData = playerResponse['streamingData'] as Record<string, unknown> | undefined;
      if (!streamingData) {
        this.logger.debug(`No streamingData for ${videoId}`);
        return variants;
      }

      // Process format streams
      const formats = streamingData['formats'] as Array<Record<string, unknown>> | undefined;
      const adaptiveFormats = streamingData['adaptiveFormats'] as
        Array<Record<string, unknown>> | undefined;

      // Combined formats (video + audio)
      if (formats) {
        for (const fmt of formats) {
          const url = fmt['url'] as string | undefined;
          if (!url) continue;

          const itag = fmt['itag'] as number;
          const width = fmt['width'] as number | undefined;
          const height = fmt['height'] as number | undefined;
          const qualityLabel = fmt['qualityLabel'] as string | undefined;
          const mimeType = fmt['mimeType'] as string | undefined;

          const format = this.extractFormatFromMime(mimeType);
          const quality = this.mapHeightToQuality(height);

          variants.push({
            quality,
            url,
            format,
            hasAudio: true,
            hasVideo: true,
            width,
            height,
          });
        }
      }

      // Adaptive formats (separate video/audio streams)
      if (adaptiveFormats) {
        for (const fmt of adaptiveFormats) {
          const url = fmt['url'] as string | undefined;
          if (!url) continue;

          const mimeType = fmt['mimeType'] as string | undefined;
          const hasVideo = mimeType?.startsWith('video/') ?? false;
          const hasAudio = mimeType?.startsWith('audio/') ?? false;
          const width = fmt['width'] as number | undefined;
          const height = fmt['height'] as number | undefined;
          const format = this.extractFormatFromMime(mimeType);

          if (hasVideo) {
            const quality = this.mapHeightToQuality(height);
            variants.push({
              quality,
              url,
              format,
              hasAudio: false, // adaptive streams are separate
              hasVideo: true,
              width,
              height,
            });
          } else if (hasAudio) {
            const bitrate = fmt['bitrate'] as number | undefined;
            variants.push({
              quality: Quality.AUDIO_ONLY,
              url,
              format: this.extractFormatFromMime(mimeType),
              hasAudio: true,
              hasVideo: false,
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to build variants for ${videoId}: ${(error as Error).message}`,
      );
    }

    return variants;
  }

  /**
   * Extract the file format from a MIME type string.
   */
  private extractFormatFromMime(mimeType?: string): string {
    if (!mimeType) return 'mp4';

    if (mimeType.includes('mp4') || mimeType.includes('avc') || mimeType.includes('av01')) {
      return 'mp4';
    }
    if (mimeType.includes('webm') || mimeType.includes('vp9') || mimeType.includes('vp8')) {
      return 'webm';
    }
    if (mimeType.includes('3gp')) return '3gp';
    if (mimeType.includes('audio/mp4') || mimeType.includes('m4a')) return 'm4a';

    return 'mp4';
  }

  /**
   * Map a video height (e.g. 1080) to a Quality enum value.
   */
  private mapHeightToQuality(height?: number): Quality {
    if (!height) return Quality.HIGHEST;
    if (height >= 2160) return Quality.ORIGINAL; // 4K
    if (height >= 1440) return Quality.ORIGINAL; // 2K
    if (height >= 1080) return Quality.P1080;
    if (height >= 720) return Quality.P720;
    if (height >= 480) return Quality.P480;
    return Quality.P360;
  }

  /**
   * Extract a channel handle from a YouTube channel URL.
   */
  private extractChannelHandle(authorUrl: string): string | undefined {
    const match = authorUrl.match(/\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)/i);
    return match ? match[1] : undefined;
  }

  /**
   * Check if the original URL is a YouTube Shorts URL.
   */
  private isShortUrl(url: string): boolean {
    return /youtube\.com\/shorts\//i.test(url) || /m\.youtube\.com\/shorts\//i.test(url);
  }

  /**
   * Select the best variant matching the requested quality.
   */
  private selectVariant(variants: MediaVariant[], quality: Quality): MediaVariant | null {
    if (variants.length === 0) return null;

    // Filter to variants that have both audio and video (combined streams)
    // when possible, as these don't require post-processing merge
    const combined = variants.filter((v) => v.hasAudio && v.hasVideo);
    const pool = combined.length > 0 ? combined : variants;

    // Exact match
    const exact = pool.find((v) => v.quality === quality);
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
      // audio_only: look for audio-only variant
      if (quality === Quality.AUDIO_ONLY) {
        const audioOnly = variants.find((v) => v.quality === Quality.AUDIO_ONLY);
        return audioOnly ?? variants[0];
      }
      return pool[0];
    }

    // Find closest quality at or below the requested level
    for (let i = requestedIndex; i < qualityOrder.length; i++) {
      const match = pool.find((v) => v.quality === qualityOrder[i]);
      if (match) return match;
    }

    // If nothing at or below, return the highest available
    return pool[0];
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
