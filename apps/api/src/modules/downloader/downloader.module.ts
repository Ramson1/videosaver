import { Module } from '@nestjs/common';
import { DownloaderController } from './downloader.controller';
import { DownloaderService } from './downloader.service';
import { UrlDetectorService } from './url-detector.service';
import { YtdlService } from './services/ytdl.service';
import { YtdlpService } from './services/ytdlp.service';
import { FacebookAdapter } from './adapters/facebook/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram/instagram.adapter';
import { TikTokAdapter } from './adapters/tiktok/tiktok.adapter';
import { YouTubeAdapter } from './adapters/youtube/youtube.adapter';
import { PinterestAdapter } from './adapters/pinterest/pinterest.adapter';
import { TwitterAdapter } from './adapters/twitter/twitter.adapter';
import { LinkedInAdapter } from './adapters/linkedin/linkedin.adapter';
import { SnapchatAdapter } from './adapters/snapchat/snapchat.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp/whatsapp.adapter';
import { GenericYtdlpAdapter } from './adapters/generic-ytdlp.adapter';

const platformAdapters = [
  FacebookAdapter,
  InstagramAdapter,
  TikTokAdapter,
  YouTubeAdapter,
  PinterestAdapter,
  TwitterAdapter,
  LinkedInAdapter,
  SnapchatAdapter,
  WhatsAppAdapter,
  GenericYtdlpAdapter,
];

@Module({
  providers: [
    DownloaderService,
    UrlDetectorService,
    YtdlService,
    YtdlpService,
    ...platformAdapters,
  ],
  controllers: [DownloaderController],
  exports: [DownloaderService, UrlDetectorService, YtdlService, YtdlpService],
})
export class DownloaderModule {}
