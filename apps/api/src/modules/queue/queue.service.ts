import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { Quality, Platform } from '../../common/interfaces/platform.interface';

export interface DownloadJobData {
  jobId: string;
  url: string;
  platform: Platform;
  mediaId: string;
  quality: Quality;
  userId?: string;
  normalizedUrl: string;
}

export interface MetadataJobData {
  url: string;
  platform: Platform;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('download') private readonly downloadQueue: Queue,
    @InjectQueue('metadata') private readonly metadataQueue: Queue,
    @InjectQueue('processing') private readonly processingQueue: Queue,
    @InjectQueue('cleanup') private readonly cleanupQueue: Queue,
  ) {}

  /**
   * Add a download job to the queue.
   */
  async addDownloadJob(data: DownloadJobData, priority = 0): Promise<Job<DownloadJobData>> {
    const job = await this.downloadQueue.add(data, {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    this.logger.log(`Download job queued: ${data.jobId} (priority: ${priority})`);
    return job;
  }

  /**
   * Add a metadata extraction job.
   */
  async addMetadataJob(data: MetadataJobData): Promise<Job<MetadataJobData>> {
    return this.metadataQueue.add(data, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
      removeOnComplete: 50,
    });
  }

  /**
   * Add a cleanup job for temporary files.
   */
  async addCleanupJob(tempDir: string, delayMs = 0): Promise<void> {
    await this.cleanupQueue.add(
      { tempDir },
      { delay: delayMs, removeOnComplete: true },
    );
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats() {
    const [downloadWaiting, downloadActive, downloadCompleted, downloadFailed] = await Promise.all([
      this.downloadQueue.getWaitingCount(),
      this.downloadQueue.getActiveCount(),
      this.downloadQueue.getCompletedCount(),
      this.downloadQueue.getFailedCount(),
    ]);

    return {
      download: { waiting: downloadWaiting, active: downloadActive, completed: downloadCompleted, failed: downloadFailed },
    };
  }

  /**
   * Cancel a queued job.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.downloadQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
    return false;
  }
}
