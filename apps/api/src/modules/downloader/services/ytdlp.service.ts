import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  Platform,
  MediaType,
  Quality,
  MediaMetadata,
  MediaVariant,
  DownloadResult,
  ParsedUrl,
} from '../../../common/interfaces/platform.interface';

const execFileAsync = promisify(execFile);

/** Map yt-dlp format names to our Quality enum. */
function resolutionToQuality(height: number | undefined): Quality {
  if (!height) return Quality.HIGHEST;
  if (height >= 1080) return Quality.P1080;
  if (height >= 720) return Quality.P720;
  if (height >= 480) return Quality.P480;
  return Quality.P360;
}

/** Map yt-dlp's detected platform to our Platform enum. */
function detectPlatform(extractor: string | undefined): Platform {
  if (!extractor) return Platform.UNKNOWN;
  const lower = extractor.toLowerCase();
  if (lower.includes('youtube')) return Platform.YOUTUBE;
  if (lower.includes('tiktok')) return Platform.TIKTOK;
  if (lower.includes('instagram')) return Platform.INSTAGRAM;
  if (lower.includes('facebook')) return Platform.FACEBOOK;
  if (lower.includes('twitter') || lower.includes('x.com')) return Platform.TWITTER;
  if (lower.includes('pinterest')) return Platform.PINTEREST;
  if (lower.includes('linkedin')) return Platform.LINKEDIN;
  if (lower.includes('snapchat')) return Platform.SNAPCHAT;
  return Platform.UNKNOWN;
}

export interface YtdlpMetadata {
  id: string;
  title: string;
  extractor: string;
  thumbnail: string;
  duration: number;
  description?: string;
  uploader?: string;
  uploader_url?: string;
  formats: Array<{
    format_id: string;
    ext: string;
    url: string;
    width?: number;
    height?: number;
    filesize?: number;
    filesize_approx?: number;
    vcodec?: string;
    acodec?: string;
    format_note?: string;
  }>;
}

@Injectable()
export class YtdlpService implements OnModuleInit {
  private readonly logger = new Logger(YtdlpService.name);
  private available = false;
  private binaryPath = 'yt-dlp';

  async onModuleInit() {
    await this.checkAvailability();
  }

  /** Check if yt-dlp binary is available on the system. */
  private async checkAvailability() {
    try {
      await execFileAsync(this.binaryPath, ['--version'], { timeout: 5000 });
      this.available = true;
      this.logger.log('yt-dlp is available');
    } catch {
      // Try common alternative paths
      const alternatives = ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
      for (const alt of alternatives) {
        try {
          await execFileAsync(alt, ['--version'], { timeout: 5000 });
          this.binaryPath = alt;
          this.available = true;
          this.logger.log(`yt-dlp found at ${alt}`);
          return;
        } catch {
          // continue
        }
      }
      this.available = false;
      this.logger.warn('yt-dlp is NOT available — falling back to scraping adapters');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  /** Extract metadata from any URL using yt-dlp. */
  async extractMetadata(url: string): Promise<YtdlpMetadata | null> {
    if (!this.available) return null;

    try {
      const { stdout } = await execFileAsync(
        this.binaryPath,
        [
          '--dump-json',
          '--no-download',
          '--no-playlist',
          '--no-warnings',
          url,
        ],
        { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
      );

      return JSON.parse(stdout) as YtdlpMetadata;
    } catch (err) {
      this.logger.warn(`yt-dlp metadata extraction failed for ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Build our MediaMetadata interface from yt-dlp output. */
  async buildMetadata(url: string): Promise<MediaMetadata | null> {
    const raw = await this.extractMetadata(url);
    if (!raw) return null;

    const platform = detectPlatform(raw.extractor);
    const variants = this.buildVariants(raw.formats);

    const isDownloadable = variants.length > 0;

    return {
      platform,
      mediaId: raw.id,
      title: raw.title || 'Unknown',
      description: raw.description?.substring(0, 500),
      author: {
        name: raw.uploader || 'Unknown',
        profileUrl: raw.uploader_url,
      },
      thumbnailUrl: raw.thumbnail,
      duration: raw.duration || 0,
      mediaType: MediaType.VIDEO,
      variants,
      sourceUrl: url,
      isDownloadable,
      restrictionReason: isDownloadable ? undefined : 'No downloadable formats found via yt-dlp',
      extractedAt: new Date(),
    };
  }

  /** Build MediaVariant[] from yt-dlp format list. */
  buildVariants(formats: YtdlpMetadata['formats']): MediaVariant[] {
    return formats
      .filter((f) => f.url && !f.url.startsWith('data:'))
      .map((f) => {
        const hasVideo = !f.vcodec || f.vcodec !== 'none';
        const hasAudio = !f.acodec || f.acodec !== 'none';

        return {
          quality: resolutionToQuality(f.height),
          url: f.url,
          fileSize: f.filesize || f.filesize_approx || undefined,
          format: f.ext || 'mp4',
          hasAudio,
          hasVideo,
          width: f.width,
          height: f.height,
        };
      })
      .filter((v) => v.url);
  }

  /** Download a URL using yt-dlp to a file. */
  async download(
    url: string,
    quality: Quality,
    outputDir: string,
  ): Promise<{ filePath: string; fileSize: number; format: string } | null> {
    if (!this.available) return null;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputTemplate = path.join(outputDir, '%(title).50s_%(id)s.%(ext)s');

    const qualityArgs = this.getQualityArgs(quality);

    try {
      const { stderr } = await execFileAsync(
        this.binaryPath,
        [
          '-f',
          qualityArgs,
          '-o',
          outputTemplate,
          '--no-playlist',
          '--no-warnings',
          '--print',
          'after_move:filepath',
          url,
        ],
        { timeout: 300_000, maxBuffer: 1024 * 1024 },
      );

      // The last line of stdout is the file path
      const lines = stderr.trim().split('\n');
      const filePath = lines[lines.length - 1].trim();

      if (!fs.existsSync(filePath)) {
        this.logger.error(`yt-dlp download completed but file not found: ${filePath}`);
        return null;
      }

      const stats = fs.statSync(filePath);
      const ext = path.extname(filePath).slice(1) || 'mp4';

      return { filePath, fileSize: stats.size, format: ext };
    } catch (err) {
      this.logger.error(`yt-dlp download failed for ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Get yt-dlp format selection args for a given quality. */
  private getQualityArgs(quality: Quality): string {
    switch (quality) {
      case Quality.P1080:
        return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
      case Quality.P720:
        return 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
      case Quality.P480:
        return 'bestvideo[height<=480]+bestaudio/best[height<=480]/best';
      case Quality.P360:
        return 'bestvideo[height<=360]+bestaudio/best[height<=360]/best';
      case Quality.AUDIO_ONLY:
        return 'bestaudio/best';
      case Quality.HIGHEST:
      case Quality.ORIGINAL:
      default:
        return 'bestvideo+bestaudio/best';
    }
  }
}
