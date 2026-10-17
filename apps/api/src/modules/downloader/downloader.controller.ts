import { Controller, Post, Get, Body, Param, Res, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { DownloaderService } from './downloader.service';

const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

@Controller('api/v1/download')
export class DownloaderController {
  constructor(private readonly service: DownloaderService) {}

  @Post('metadata')
  @HttpCode(HttpStatus.OK)
  async metadata(@Body('url') url: string) {
    return this.service.getMetadata(url);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async download(@Body() body: { url: string; quality?: string }) {
    return this.service.download(body.url, body.quality);
  }

  @Get('file/:filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.join(DOWNLOAD_DIR, filename);
    if (!filePath.startsWith(DOWNLOAD_DIR) || !fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    res.sendFile(filePath);
  }
}
