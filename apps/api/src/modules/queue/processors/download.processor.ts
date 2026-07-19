import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DownloaderService } from '../../downloader/downloader.service';
import { StorageService } from '../../storage/storage.service';
import { DownloadJobData } from '../queue.service';

@Processor('download')
export class DownloadProcessor {
  private readonly logger = new Logger(DownloadProcessor.name);

  constructor(
    private readonly downloaderService: DownloaderService,
    private readonly storageService: StorageService,
  ) {}

  @Process('download')
  async handleDownload(job: Job<DownloadJobData>) {
    const { jobId, url, quality, userId } = job.data;

    this.logger.log(`Processing download job: ${jobId}`);
    await job.progress(10);

    try {
      // Step 1: Download the media
      const result = await this.downloaderService.download({ url, quality, userId });
      await job.progress(60);

      if (result.status === 'failed' || !result.result) {
        throw new Error(result.error || 'Download failed');
      }

      // Step 2: Upload to storage
      const storageResult = await this.storageService.uploadFile(result.result.filePath, userId);
      await job.progress(90);

      // Step 3: Schedule cleanup of temp files
      // (handled by cleanup queue)

      await job.progress(100);

      return {
        ...result,
        storageUrl: storageResult.storageUrl,
        signedUrl: storageResult.signedUrl,
      };
    } catch (error) {
      this.logger.error(`Download job ${jobId} failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      throw error;
    }
  }
}
