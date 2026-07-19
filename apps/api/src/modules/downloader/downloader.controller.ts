import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { DownloaderService, DownloadRequest } from './downloader.service';
import { Quality } from '../../common/interfaces/platform.interface';

@ApiTags('download')
@Controller('api/v1/download')
export class DownloaderController {
  constructor(private readonly downloaderService: DownloaderService) {}

  @Post('detect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect platform from URL' })
  @ApiBody({ schema: { properties: { url: { type: 'string' } } } })
  detectPlatform(@Body('url') url: string) {
    return this.downloaderService.detectPlatform(url);
  }

  @Post('metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract metadata from a media URL' })
  @ApiBody({ schema: { properties: { url: { type: 'string' } } } })
  async getMetadata(@Body('url') url: string) {
    return this.downloaderService.extractMetadata(url);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download media from a URL' })
  @ApiBody({
    schema: {
      properties: {
        url: { type: 'string' },
        quality: { type: 'string', enum: Object.values(Quality) },
      },
    },
  })
  async download(@Body() request: DownloadRequest) {
    return this.downloaderService.download(request);
  }

  @Get('platforms')
  @ApiOperation({ summary: 'List all supported platforms' })
  async getPlatforms() {
    return this.downloaderService.getSupportedPlatforms();
  }
}
