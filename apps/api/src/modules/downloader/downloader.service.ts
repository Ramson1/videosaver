import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { getVideoInfo, selectFormat, downloadVideo } from 'yt-dlp.ts';
import * as path from 'path';
import * as fs from 'fs';

const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

// Add yt-dlp and deno to PATH
const ytdlpPath = path.join(
  process.env.LOCALAPPDATA || '',
  'Python', 'pythoncore-3.14-64', 'Scripts',
);
const denoPath = path.join(
  process.env.LOCALAPPDATA || '',
  'Microsoft', 'WinGet', 'Links',
);
[ytdlpPath, denoPath].forEach((p) => {
  if (p && !process.env.PATH?.includes(p)) {
    process.env.PATH = `${process.env.PATH || ''};${p}`;
  }
});

@Injectable()
export class DownloaderService implements OnModuleInit {
  private readonly logger = new Logger(DownloaderService.name);

  async onModuleInit() {
    this.logger.log(`yt-dlp PATH: ${ytdlpPath}`);
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }
  }

  /**
   * Get video metadata (title, formats, thumbnail, etc.)
   */
  async getMetadata(url: string) {
    if (!url) throw new BadRequestException('URL is required');

    this.logger.log(`Fetching metadata for: ${url}`);
    const info = await getVideoInfo({ url });

    return {
      id: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      formats: info.formats?.map((f: any) => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || `${f.width}x${f.height}`,
        filesize: f.filesize || f.filesize_approx,
        vcodec: f.vcodec,
        acodec: f.acodec,
      })),
    };
  }

  /**
   * Download a video to local disk and return the file path.
   */
  async download(url: string, quality?: string) {
    if (!url) throw new BadRequestException('URL is required');

    this.logger.log(`Downloading: ${url} @ ${quality || 'best'}`);

    // Get metadata to select format
    const info = await getVideoInfo({ url });

    // Select format based on quality preference
    let format;
    if (quality === 'audio') {
      format = selectFormat({ info: info as any, media_type: 'audio', ext: 'mp3' });
    } else {
      const resolution = quality || 'max';
      format = selectFormat({ info: info as any, media_type: 'video', resolution });
    }

    if (!format) {
      throw new BadRequestException('No matching format found');
    }

    // Download
    const result = await downloadVideo({
      url,
      format_id: format.format_id,
      directory: DOWNLOAD_DIR,
    });

    const filePath = path.join(DOWNLOAD_DIR, result.filename);

    return {
      filename: result.filename,
      filepath: filePath,
      title: info.title,
    };
  }
}
