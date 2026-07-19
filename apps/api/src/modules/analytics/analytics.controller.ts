import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('daily')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get daily download statistics' })
  async getDailyStats() {
    return this.analyticsService.getDailyStats();
  }
}
