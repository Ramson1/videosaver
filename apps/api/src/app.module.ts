import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';

import { appConfig } from './config/app.config';
import { HealthModule } from './modules/health/health.module';
import { DownloaderModule } from './modules/downloader/downloader.module';
import { AuthModule } from './modules/auth/auth.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { CacheModule } from './modules/cache/cache.module';
import { FfmpegModule } from './modules/ffmpeg/ffmpeg.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // BullMQ Queue (Redis)
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
        },
      }),
    }),

    // Feature Modules
    HealthModule,
    AuthModule,
    DownloaderModule,
    StorageModule,
    QueueModule,
    CacheModule,
    FfmpegModule,
    AnalyticsModule,
    AdminModule,
  ],
})
export class AppModule {}
