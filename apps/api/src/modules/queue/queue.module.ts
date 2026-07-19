import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from './queue.service';
import { DownloadProcessor } from './processors/download.processor';
import { DownloaderModule } from '../downloader/downloader.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    DownloaderModule,
    StorageModule,
    BullModule.registerQueue({
      name: 'download',
    }),
    BullModule.registerQueue({
      name: 'metadata',
    }),
    BullModule.registerQueue({
      name: 'processing',
    }),
    BullModule.registerQueue({
      name: 'cleanup',
    }),
  ],
  providers: [QueueService, DownloadProcessor],
  exports: [QueueService],
})
export class QueueModule {}
