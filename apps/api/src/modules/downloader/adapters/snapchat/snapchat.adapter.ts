import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
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

/**
 * Content type detected from a Snapchat URL.
 */
enum SnapchatContentType {
  SPOTLIGHT = 'spotlight',
  PUBLIC_STORY = 'public_story',
  UNKNOWN = 'unknown',
}

/**
 * Timeout in milliseconds for HTTP requests to Snapchat endpoints.
 */
const HTTP_TIMEOUT_MS = 15_000;

/**
 * Snapchat platform adapter.
 *
 * Supports downloading from:
 * - Snapchat Spotlight (short-form public videos)
 * - Snapchat Public Stories (creator-published stories with web access)
 *
 * Limitations:
 * - Private stories and snaps are NOT accessible (by design).
 * - Snapchat content is ephemeral; stories may expire before download.
 * - Snapchat may change or obfuscate their web endpoints at any time.
 */
@Injectable()
export class SnapchatAdapter extends PlatformAdapter {
  private readonly logger = new Logger(SnapchatAdapter.name);

  readonly name = Platform.SNAPCHAT;
  readonly displayName = 'Snapchat';

  readonly urlPatterns: RegExp[] = [
    // Spotlight video URLs: snapchat.com/spotlight/<id>
    /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/spotlight\/([\w-]+)/i,
    // Public story / add-on URLs: snapchat.com/add/<username> or stories paths
    /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/(?:add|t|stories)\/([\w.-]+)/i,
    // stories.snapchat.com subdomain
    /(?:https?:\/\/)?stories\.snapchat\.com\/([\w.-]+)\/?/i,
    // Short links: snapch.at/<code>
    /(?:https?:\/\/)?snapch\.at\/([\w]+)/i,
    // General snapchat.com/watch for spotlight
    /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/watch\/([\w-]+)/i,
  ];

  /**
   * Check if the Snapchat adapter can currently reach Snapchat's public endpoints.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch('https://www.snapchat.com', {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);
      const available = response.ok || response.status === 301 || response.status === 302;
      this.logger.debug(`Snapchat availability check: ${available}`);
      return available;
    } catch (error) {
      this.logger.warn(`Snapchat availability check failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Parse a Snapchat URL and extract the media/content ID.
   */
  parseUrl(url: string): ParsedUrl {
    if (!url || typeof url !== 'string') {
      return {
        originalUrl: url ?? '',
        platform: Platform.SNAPCHAT,
        mediaId: '',
        normalizedUrl: '',
        isValid: false,
        error: 'Invalid or empty URL',
      };
    }

    try {
      const contentType = this.detectContentType(url);
      const mediaId = this.extractMediaId(url, contentType);

      if (!mediaId) {
        return {
          originalUrl: url,
          platform: Platform.SNAPCHAT,
          mediaId: '',
          normalizedUrl: url,
          isValid: false,
          error: `Could not extract content ID from Snapchat URL`,
        };
      }

      const normalizedUrl = this.normalizeUrl(url, contentType, mediaId);

      return {
        originalUrl: url,
        platform: Platform.SNAPCHAT,
        mediaId,
        normalizedUrl,
        isValid: true,
      };
    } catch (error) {
      this.logger.warn(`Failed to parse Snapchat URL: ${(error as Error).message}`);
      return {
        originalUrl: url,
        platform: Platform.SNAPCHAT,
        mediaId: '',
        normalizedUrl: url,
        isValid: false,
        error: `URL parsing failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Extract metadata from a Snapchat URL.
   *
   * Snapchat's public web endpoints embed metadata in the page HTML or
   * expose it through internal JSON APIs. This method attempts to retrieve
   * that metadata and construct a MediaMetadata object.
   */
  async extractMetadata(parsedUrl: ParsedUrl): Promise<MediaMetadata> {
    if (!parsedUrl.isValid) {
      throw new Error(`Cannot extract metadata from invalid URL: ${parsedUrl.error}`);
    }

    this.logger.debug(`Extracting metadata for Snapchat content: ${parsedUrl.mediaId}`);

    const contentType = this.detectContentType(parsedUrl.normalizedUrl);

    try {
      const html = await this.fetchPageHtml(parsedUrl.normalizedUrl);
      const metadata = this.parseMetadataFromHtml(html, parsedUrl, contentType);

      if (!metadata) {
        // Content may have expired or been removed
        this.logger.warn(
          `Could not extract metadata for Snapchat content: ${parsedUrl.mediaId}. ` +
            'Content may have expired or been removed.',
        );

        return {
          platform: Platform.SNAPCHAT,
          mediaId: parsedUrl.mediaId,
          title: 'Snapchat Content',
          author: { name: 'Unknown' },
          mediaType: MediaType.VIDEO,
          variants: [],
          sourceUrl: parsedUrl.normalizedUrl,
          isDownloadable: false,
          restrictionReason:
            'Content is either expired (Snapchat stories are ephemeral), ' +
            'private, or no longer publicly accessible.',
          extractedAt: new Date(),
        };
      }

      return metadata;
    } catch (error) {
      this.logger.error(
        `Metadata extraction failed for ${parsedUrl.mediaId}: ${(error as Error).message}`,
      );
      throw new Error(
        `Failed to extract Snapchat metadata: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Download Snapchat media at the requested quality.
   */
  async download(
    parsedUrl: ParsedUrl,
    quality: Quality,
    outputDir: string,
  ): Promise<DownloadResult> {
    if (!parsedUrl.isValid) {
      throw new Error(`Cannot download from invalid URL: ${parsedUrl.error}`);
    }

    this.logger.log(
      `Starting Snapchat download: ${parsedUrl.mediaId} at quality ${quality}`,
    );

    const metadata = await this.extractMetadata(parsedUrl);

    if (!metadata.isDownloadable || metadata.variants.length === 0) {
      throw new Error(
        metadata.restrictionReason ??
          'Content is not downloadable. It may have expired or is not publicly accessible.',
      );
    }

    const variant = this.selectVariant(metadata.variants, quality);

    if (!variant) {
      throw new Error(
        `No suitable variant found for quality "${quality}". ` +
          `Available: ${metadata.variants.map((v) => v.quality).join(', ')}`,
      );
    }

    try {
      const fileBuffer = await this.downloadMediaBuffer(variant.url);
      const fileName = this.buildFileName(parsedUrl.mediaId, variant.format);
      const filePath = `${outputDir}/${fileName}`;

      // In production, this would write to disk and upload to storage.
      // The actual file writing is handled by the downloader service layer.
      const jobId = uuidv4();

      return {
        jobId,
        platform: Platform.SNAPCHAT,
        mediaId: parsedUrl.mediaId,
        title: metadata.title,
        quality: variant.quality,
        filePath,
        fileSize: fileBuffer.byteLength,
        format: variant.format,
        thumbnailPath: metadata.thumbnailUrl,
        storageUrl: '',
        signedUrl: '',
        signedUrlExpiresAt: new Date(),
        duration: metadata.duration,
        completedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Download failed for ${parsedUrl.mediaId}: ${(error as Error).message}`,
      );
      throw new Error(`Snapchat download failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get the content types supported by this adapter.
   */
  getSupportedTypes(): string[] {
    return [MediaType.VIDEO, MediaType.IMAGE];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Detect the type of Snapchat content from the URL structure.
   */
  private detectContentType(url: string): SnapchatContentType {
    if (/\/spotlight\//i.test(url) || /\/watch\//i.test(url)) {
      return SnapchatContentType.SPOTLIGHT;
    }

    if (
      /\/add\//i.test(url) ||
      /\/stories\//i.test(url) ||
      /stories\.snapchat\.com/i.test(url) ||
      /snapch\.at\//i.test(url) ||
      /\/t\//i.test(url)
    ) {
      return SnapchatContentType.PUBLIC_STORY;
    }

    return SnapchatContentType.UNKNOWN;
  }

  /**
   * Extract the media/content ID from a Snapchat URL.
   */
  private extractMediaId(url: string, contentType: SnapchatContentType): string | null {
    // Spotlight: snapchat.com/spotlight/<id> or snapchat.com/watch/<id>
    if (contentType === SnapchatContentType.SPOTLIGHT) {
      const spotlightMatch = url.match(/\/(?:spotlight|watch)\/([\w-]+)/i);
      return spotlightMatch ? spotlightMatch[1] : null;
    }

    // Public story: snapchat.com/add/<username>, stories.snapchat.com/<id>, snapch.at/<code>
    if (contentType === SnapchatContentType.PUBLIC_STORY) {
      // snapch.at short links
      const shortLinkMatch = url.match(/snapch\.at\/([\w]+)/i);
      if (shortLinkMatch) {
        return shortLinkMatch[1];
      }

      // stories.snapchat.com/<username>/<storyId>
      const storiesSubdomainMatch = url.match(
        /stories\.snapchat\.com\/([\w.-]+)(?:\/([\w-]+))?/i,
      );
      if (storiesSubdomainMatch) {
        // Return username + story ID if available, otherwise just username
        return storiesSubdomainMatch[2]
          ? `${storiesSubdomainMatch[1]}/${storiesSubdomainMatch[2]}`
          : storiesSubdomainMatch[1];
      }

      // snapchat.com/add/<username> or snapchat.com/t/<code> or snapchat.com/stories/<path>
      const pathMatch = url.match(/\/(?:add|t|stories)\/([\w.-]+(?:\/[\w.-]+)*)/i);
      if (pathMatch) {
        return pathMatch[1];
      }
    }

    // Fallback: try to extract any meaningful ID from the path
    const fallbackMatch = url.match(/snapchat\.com\/([\w.-]+)/i);
    return fallbackMatch ? fallbackMatch[1] : null;
  }

  /**
   * Normalize a Snapchat URL to a canonical form.
   */
  private normalizeUrl(
    url: string,
    contentType: SnapchatContentType,
    mediaId: string,
  ): string {
    // Ensure HTTPS
    let normalized = url.replace(/^http:\/\//i, 'https://');

    // Resolve snapch.at short links to their canonical form
    if (contentType === SnapchatContentType.PUBLIC_STORY && /snapch\.at\//i.test(url)) {
      // Keep the short link as-is; it will be resolved during fetch
      return normalized;
    }

    // Ensure www prefix for snapchat.com
    if (!/^(https:\/\/)?(www\.|stories\.)/i.test(normalized)) {
      normalized = normalized.replace('https://', 'https://www.');
    }

    return normalized;
  }

  /**
   * Fetch the HTML content of a Snapchat page.
   */
  private async fetchPageHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(
          `Snapchat returned HTTP ${response.status} ${response.statusText}`,
        );
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse metadata from the HTML of a Snapchat page.
   *
   * Snapchat embeds structured data in JSON-LD, OpenGraph meta tags,
   * and inline script tags. This method attempts multiple extraction strategies.
   */
  private parseMetadataFromHtml(
    html: string,
    parsedUrl: ParsedUrl,
    contentType: SnapchatContentType,
  ): MediaMetadata | null {
    // Strategy 1: Extract from JSON-LD structured data
    const jsonLdMetadata = this.extractFromJsonLd(html, parsedUrl, contentType);
    if (jsonLdMetadata) {
      return jsonLdMetadata;
    }

    // Strategy 2: Extract from OpenGraph meta tags
    const ogMetadata = this.extractFromOpenGraph(html, parsedUrl, contentType);
    if (ogMetadata) {
      return ogMetadata;
    }

    // Strategy 3: Extract from inline script data (Next.js __NEXT_DATA__ or similar)
    const scriptMetadata = this.extractFromInlineScript(html, parsedUrl, contentType);
    if (scriptMetadata) {
      return scriptMetadata;
    }

    return null;
  }

  /**
   * Extract metadata from JSON-LD structured data in the page.
   */
  private extractFromJsonLd(
    html: string,
    parsedUrl: ParsedUrl,
    contentType: SnapchatContentType,
  ): MediaMetadata | null {
    try {
      const jsonLdMatch = html.match(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
      );

      if (!jsonLdMatch?.[1]) {
        return null;
      }

      const jsonLd = JSON.parse(this.decodeHtmlEntities(jsonLdMatch[1]));

      // Handle both single object and array of JSON-LD items
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      const videoItem = items.find(
        (item: Record<string, unknown>) =>
          item['@type'] === 'VideoObject' || item['@type'] === 'SocialMediaPosting',
      );

      if (!videoItem) {
        return null;
      }

      const variants = this.buildVariantsFromSource(
        (videoItem.contentUrl as string) || (videoItem.embedUrl as string),
      );

      return {
        platform: Platform.SNAPCHAT,
        mediaId: parsedUrl.mediaId,
        title: (videoItem.name as string) || 'Snapchat Spotlight',
        description: (videoItem.description as string) || undefined,
        author: {
          name:
            (videoItem.creator as Record<string, string>)?.name ||
            (videoItem.author as Record<string, string>)?.name ||
            'Unknown Creator',
          username: parsedUrl.mediaId,
          profileUrl: `https://www.snapchat.com/add/${parsedUrl.mediaId}`,
        },
        thumbnailUrl: (videoItem.thumbnailUrl as string) || undefined,
        duration: this.parseDurationToSeconds(videoItem.duration as string),
        mediaType: MediaType.VIDEO,
        variants,
        sourceUrl: parsedUrl.normalizedUrl,
        isDownloadable: variants.length > 0,
        restrictionReason:
          variants.length === 0 ? 'No downloadable media source found in page data' : undefined,
        extractedAt: new Date(),
      };
    } catch (error) {
      this.logger.debug(`JSON-LD extraction failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Extract metadata from OpenGraph meta tags.
   */
  private extractFromOpenGraph(
    html: string,
    parsedUrl: ParsedUrl,
    contentType: SnapchatContentType,
  ): MediaMetadata | null {
    try {
      const ogTitle = this.extractMetaContent(html, 'og:title');
      const ogDescription = this.extractMetaContent(html, 'og:description');
      const ogVideo = this.extractMetaContent(html, 'og:video') ||
        this.extractMetaContent(html, 'og:video:url');
      const ogVideoType = this.extractMetaContent(html, 'og:video:type');
      const ogImage = this.extractMetaContent(html, 'og:image');
      const ogType = this.extractMetaContent(html, 'og:type');

      // Must have at least a video or image source to be useful
      if (!ogVideo && !ogImage) {
        return null;
      }

      const mediaUrl = ogVideo || ogImage;
      const isVideo = !!ogVideo || ogType === 'video';
      const variants = this.buildVariantsFromSource(mediaUrl);

      const authorName =
        this.extractMetaContent(html, 'og:article:author') ||
        this.extractMetaContent(html, 'author') ||
        'Unknown Creator';

      return {
        platform: Platform.SNAPCHAT,
        mediaId: parsedUrl.mediaId,
        title: ogTitle || 'Snapchat Content',
        description: ogDescription || undefined,
        author: {
          name: authorName,
          username: parsedUrl.mediaId,
          profileUrl: `https://www.snapchat.com/add/${parsedUrl.mediaId}`,
        },
        thumbnailUrl: ogImage || undefined,
        mediaType: isVideo ? MediaType.VIDEO : MediaType.IMAGE,
        variants,
        sourceUrl: parsedUrl.normalizedUrl,
        isDownloadable: variants.length > 0,
        restrictionReason:
          variants.length === 0 ? 'No downloadable media source found in OpenGraph data' : undefined,
        extractedAt: new Date(),
      };
    } catch (error) {
      this.logger.debug(`OpenGraph extraction failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Extract metadata from inline script data (e.g., __NEXT_DATA__).
   */
  private extractFromInlineScript(
    html: string,
    parsedUrl: ParsedUrl,
    contentType: SnapchatContentType,
  ): MediaMetadata | null {
    try {
      // Snapchat may use Next.js-style inline data
      const nextDataMatch = html.match(
        /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
      );

      if (!nextDataMatch?.[1]) {
        return null;
      }

      const nextData = JSON.parse(nextDataMatch[1]);
      const props = nextData?.props?.pageProps;

      if (!props) {
        return null;
      }

      // Attempt to find media URL in the page props
      const mediaUrl =
        props.videoUrl ||
        props.mediaUrl ||
        props.contentUrl ||
        props.story?.mediaUrl ||
        props.spotlight?.videoUrl;

      if (!mediaUrl) {
        return null;
      }

      const variants = this.buildVariantsFromSource(mediaUrl);

      return {
        platform: Platform.SNAPCHAT,
        mediaId: parsedUrl.mediaId,
        title: props.title || props.story?.title || 'Snapchat Content',
        description: props.description || props.story?.description || undefined,
        author: {
          name:
            props.authorName ||
            props.story?.authorName ||
            props.creatorName ||
            'Unknown Creator',
          username: props.username || parsedUrl.mediaId,
          profileUrl: `https://www.snapchat.com/add/${parsedUrl.mediaId}`,
          avatarUrl: props.authorAvatar || props.story?.authorAvatar || undefined,
        },
        thumbnailUrl:
          props.thumbnailUrl || props.story?.thumbnailUrl || props.imageUrl || undefined,
        duration: props.duration || props.story?.duration || undefined,
        mediaType: contentType === SnapchatContentType.SPOTLIGHT ? MediaType.VIDEO : MediaType.VIDEO,
        variants,
        sourceUrl: parsedUrl.normalizedUrl,
        isDownloadable: variants.length > 0,
        restrictionReason:
          variants.length === 0 ? 'No downloadable media source found in page data' : undefined,
        extractedAt: new Date(),
      };
    } catch (error) {
      this.logger.debug(`Inline script extraction failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Build media variants from a single source URL.
   * Snapchat typically serves one video quality per URL.
   */
  private buildVariantsFromSource(mediaUrl: string | null | undefined): MediaVariant[] {
    if (!mediaUrl) {
      return [];
    }

    const format = this.detectFormatFromUrl(mediaUrl);
    const isVideo = /\.(mp4|webm|m3u8|mov)(\?|$)/i.test(mediaUrl);

    return [
      {
        quality: Quality.ORIGINAL,
        url: mediaUrl,
        format,
        hasAudio: isVideo,
        hasVideo: isVideo || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl),
      },
    ];
  }

  /**
   * Detect the media format from a URL's file extension.
   */
  private detectFormatFromUrl(url: string): string {
    const extMatch = url.match(/\.(\w{2,5})(?:\?|$)/);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      const formatMap: Record<string, string> = {
        mp4: 'mp4',
        webm: 'webm',
        m3u8: 'm3u8',
        mov: 'mov',
        jpg: 'jpeg',
        jpeg: 'jpeg',
        png: 'png',
        webp: 'webp',
      };
      return formatMap[ext] || ext;
    }
    return 'mp4'; // Default assumption for video content
  }

  /**
   * Select the best matching variant for the requested quality.
   */
  private selectVariant(variants: MediaVariant[], quality: Quality): MediaVariant | null {
    if (variants.length === 0) {
      return null;
    }

    // If ORIGINAL or HIGHEST requested, return the first (best) variant
    if (quality === Quality.ORIGINAL || quality === Quality.HIGHEST) {
      return variants[0];
    }

    // Try to find an exact quality match
    const exactMatch = variants.find((v) => v.quality === quality);
    if (exactMatch) {
      return exactMatch;
    }

    // Fall back to the first available variant
    return variants[0];
  }

  /**
   * Download media content into a buffer.
   */
  private async downloadMediaBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.snapchat.com/',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Media download returned HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Build a file name for the downloaded media.
   */
  private buildFileName(mediaId: string, format: string): string {
    const sanitizedId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    return `snapchat_${sanitizedId}.${format}`;
  }

  /**
   * Extract content from an OpenGraph or standard meta tag.
   */
  private extractMetaContent(html: string, property: string): string | null {
    // Match <meta property="..." content="..."> or <meta name="..." content="...">
    const patterns = [
      new RegExp(
        `<meta[^>]*(?:property|name)=["']${this.escapeRegex(property)}["'][^>]*content=["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${this.escapeRegex(property)}["']`,
        'i',
      ),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return this.decodeHtmlEntities(match[1]);
      }
    }

    return null;
  }

  /**
   * Parse an ISO 8601 duration string to seconds.
   */
  private parseDurationToSeconds(duration: string | undefined): number | undefined {
    if (!duration) {
      return undefined;
    }

    // ISO 8601 duration: PT1M30S
    const isoMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (isoMatch) {
      const hours = parseInt(isoMatch[1] || '0', 10);
      const minutes = parseInt(isoMatch[2] || '0', 10);
      const seconds = parseInt(isoMatch[3] || '0', 10);
      return hours * 3600 + minutes * 60 + seconds;
    }

    // Plain numeric (seconds)
    const numeric = parseFloat(duration);
    return isNaN(numeric) ? undefined : numeric;
  }

  /**
   * Decode common HTML entities.
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#47;/g, '/');
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
