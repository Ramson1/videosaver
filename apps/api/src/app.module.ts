import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { appConfig } from './config/app.config';
import { HealthModule } from './modules/health/health.module';
import { DownloaderModule } from './modules/downloader/downloader.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    HealthModule,
    DownloaderModule,
  ],
})
export class AppModule {}
