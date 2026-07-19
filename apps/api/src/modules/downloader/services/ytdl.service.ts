import { Injectable, Logger } from '@nestjs/common';
import ytdl from '@distube/ytdl-core';
import { Quality, MediaVariant, MediaMetadata, Platform, MediaType } from '../../../common/interfaces/platform.interface';

/**
 * Quality map from our Quality enum to ytdl-core itag / height preferences.
 */
const QUALITY_HEIGHT_MAP: Record<string, number | null> = {
  [Quality.P1080]: 1080,
  [Quality.P720]: 720,
  [Quality.P480]: 480,
  [Quality.P360]: 360,
  [Quality.HIGHEST]: null, // best available
  [Quality.ORIGINAL]: null,
  [Quality.AUDIO_ONLY]: null,
};

export interface YtdlVideoInfo {
  title: string;
  author: string;
  authorUrl?: string;
  thumbnailUrl: string;
  duration: number;
  description?: string;
  formats: ytdl.videoFormat[];
  videoId: string;
  isLive: boolean;
  isPrivate: boolean;
  isFamilySafe: boolean;
}

@Injectable()
export class YtdlService {
  private readonly logger = new Logger(YtdlService.name);

  /**
   * Get full video info including all available formats.
   */
  async getInfo(videoIdOrUrl: string): Promise<YtdlVideoInfo> {
    const url = videoIdOrUrl.startsWith('http')
      ? videoIdOrUrl
      : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

    this.logger.debug(`Fetching ytdl info for: ${url}`);

    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;

    return {
      title: details.title,
      author: details.author?.name ?? 'Unknown',
      authorUrl: details.author?.channel_url,
      thumbnailUrl:
        details.thumbnails?.[details.thumbnails.length - 1]?.url ??
        `https://i.ytimg.com/vi/${details.videoId}/hqdefault.jpg`,
      duration: parseInt(details.lengthSeconds || '0', 10),
      description: details.description?.substring(0, 500),
      formats: info.formats,
      videoId: details.videoId,
      isLive: details.isLiveContent || false,
      isPrivate: details.isPrivate || false,
      isFamilySafe: details.isFamilySafe !== false,
    };
  }

  /**
   * Build MediaVariant[] from ytdl formats.
   */
  buildVariants(formats: ytdl.videoFormat[]): MediaVariant[] {
    return formats
      .filter((f) => f.url) // only formats with direct URLs
      .map((f) => {
        const hasVideo = f.hasVideo !== false;
        const hasAudio = f.hasAudio !== false;
        const height = f.height ?? undefined;

        let quality: Quality;
        if (!hasVideo && hasAudio) {
          quality = Quality.AUDIO_ONLY;
        } else if (height && height >= 1080) {
          quality = Quality.P1080;
        } else if (height && height >= 720) {
          quality = Quality.P720;
        } else if (height && height >= 480) {
          quality = Quality.P480;
        } else if (height) {
          quality = Quality.P360;
        } else {
          quality = Quality.HIGHEST;
        }

        return {
          quality,
          url: f.url,
          fileSize: f.contentLength ? parseInt(f.contentLength, 10) : undefined,
          format: f.container || 'mp4',
          hasAudio,
          hasVideo,
          width: f.width ?? undefined,
          height,
        };
      })
      .filter((v) => v.url); // remove any without URLs
  }

  /**
   * Build full MediaMetadata from ytdl info.
   */
  async buildMetadata(videoIdOrUrl: string): Promise<MediaMetadata> {
    const info = await this.getInfo(videoIdOrUrl);
    const variants = this.buildVariants(info.formats);

    // Filter to downloadable variants (with direct URLs)
    const downloadableVariants = variants.filter((v) => v.url);

    const isDownloadable =
      !info.isLive &&
      !info.isPrivate &&
      info.isFamilySafe &&
      downloadableVariants.length > 0;

    return {
      platform: Platform.YOUTUBE,
      mediaId: info.videoId,
      title: info.title,
      description: info.description,
      author: {
        name: info.author,
        profileUrl: info.authorUrl,
      },
      thumbnailUrl: info.thumbnailUrl,
      duration: info.duration,
      mediaType: MediaType.VIDEO,
      variants: downloadableVariants,
      sourceUrl: `https://www.youtube.com/watch?v=${info.videoId}`,
      isDownloadable,
      restrictionReason: isDownloadable
        ? undefined
        : info.isLive
          ? 'Live streams cannot be downloaded'
          : info.isPrivate
            ? 'Video is private'
            : !info.isFamilySafe
              ? 'Content is age-restricted'
              : 'No downloadable formats found',
      extractedAt: new Date(),
    };
  }

  /**
   * Get the best download URL for a given quality.
   */
  getBestUrl(formats: ytdl.videoFormat[], quality: Quality): string | null {
    const variants = this.buildVariants(formats);

    if (quality === Quality.AUDIO_ONLY) {
      const audio = variants.find((v) => !v.hasVideo && v.hasAudio);
      return audio?.url ?? null;
    }

    if (quality === Quality.HIGHEST || quality === Quality.ORIGINAL) {
      const video = variants
        .filter((v) => v.hasVideo && v.hasAudio)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
      return video[0]?.url ?? null;
    }

    const targetHeight = QUALITY_HEIGHT_MAP[quality];
    if (!targetHeight) return null;

    // Find closest match
    const video = variants
      .filter((v) => v.hasVideo && v.hasAudio && v.height && v.height <= targetHeight)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

    return video[0]?.url ?? null;
  }

  /**
   * Create a download stream for a YouTube video.
   */
  createStream(videoIdOrUrl: string, quality?: Quality): NodeJS.ReadableStream {
    const url = videoIdOrUrl.startsWith('http')
      ? videoIdOrUrl
      : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

    const ytdlQuality =
      quality === Quality.AUDIO_ONLY
        ? 'highestaudio'
        : quality === Quality.HIGHEST || quality === Quality.ORIGINAL
          ? 'highest'
          : 'highest';

    return ytdl(url, {
      quality: ytdlQuality,
      filter: quality === Quality.AUDIO_ONLY ? 'audioonly' : 'videoandaudio',
    });
  }
}
