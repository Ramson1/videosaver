import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export interface FfmpegOptions {
  input: string;
  output: string;
  audioOnly?: boolean;
  quality?: string;
  format?: string;
  thumbnail?: { timestamp?: string; width?: number; height?: number };
  compress?: { bitrate?: string; crf?: number };
  resize?: { width: number; height: number };
  trim?: { start: string; duration: string };
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  format: string;
  hasAudio: boolean;
  hasVideo: boolean;
  fileSize: number;
}

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(private readonly config: ConfigService) {
    this.ffmpegPath = this.config.get<string>('app.ffmpeg.path', 'ffmpeg');
    this.ffprobePath = this.config.get<string>('app.ffmpeg.ffprobePath', 'ffprobe');
  }

  /**
   * Probe media file for metadata.
   */
  async probe(filePath: string): Promise<MediaInfo> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const { stdout } = await execFileAsync(this.ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');

    return {
      duration: parseFloat(info.format?.duration || '0'),
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      bitrate: parseInt(info.format?.bit_rate || '0', 10),
      format: info.format?.format_name || 'unknown',
      hasAudio: !!audioStream,
      hasVideo: !!videoStream,
      fileSize: parseInt(info.format?.size || '0', 10),
    };
  }

  /**
   * Extract audio from a video file.
   */
  async extractAudio(input: string, output: string, format = 'mp3'): Promise<string> {
    const args = [
      '-i', input,
      '-vn',
      '-acodec', format === 'mp3' ? 'libmp3lame' : 'aac',
      '-ab', '192k',
      '-y',
      output,
    ];

    await this.execute(args);
    return output;
  }

  /**
   * Generate a thumbnail from a video.
   */
  async generateThumbnail(
    input: string,
    outputDir: string,
    timestamp = '00:00:01',
    width = 480,
  ): Promise<string> {
    const output = join(outputDir, `thumb_${Date.now()}.jpg`);

    const args = [
      '-i', input,
      '-ss', timestamp,
      '-vframes', '1',
      '-vf', `scale=${width}:-1`,
      '-q:v', '2',
      '-y',
      output,
    ];

    await this.execute(args);
    return output;
  }

  /**
   * Convert video to a different format/quality.
   */
  async convert(input: string, output: string, options: Partial<FfmpegOptions> = {}): Promise<string> {
    const args: string[] = ['-i', input];

    if (options.compress?.crf) {
      args.push('-crf', String(options.compress.crf));
    }

    if (options.compress?.bitrate) {
      args.push('-b:v', options.compress.bitrate);
    }

    if (options.resize) {
      args.push('-vf', `scale=${options.resize.width}:${options.resize.height}`);
    }

    if (options.trim) {
      if (options.trim.start) args.push('-ss', options.trim.start);
      if (options.trim.duration) args.push('-t', options.trim.duration);
    }

    if (options.format) {
      args.push('-f', options.format);
    }

    args.push('-y', output);
    await this.execute(args);
    return output;
  }

  /**
   * Merge separate audio and video streams.
   */
  async mergeStreams(videoPath: string, audioPath: string, output: string): Promise<string> {
    const args = [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-strict', 'experimental',
      '-y',
      output,
    ];

    await this.execute(args);
    return output;
  }

  /**
   * Compress a video file.
   */
  async compress(input: string, output: string, crf = 23): Promise<string> {
    const args = [
      '-i', input,
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      output,
    ];

    await this.execute(args);
    return output;
  }

  private async execute(args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(this.ffmpegPath, args, {
        timeout: 300_000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr) {
        this.logger.debug(`FFmpeg: ${stderr.substring(0, 200)}`);
      }

      return stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FFmpeg execution failed';
      this.logger.error(`FFmpeg error: ${message}`);
      throw new Error(`FFmpeg failed: ${message}`);
    }
  }
}
