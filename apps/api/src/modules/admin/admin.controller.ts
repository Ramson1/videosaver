import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUsers(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.getUsers(page, limit);
  }

  @Get('platforms')
  @ApiOperation({ summary: 'Get platform-specific statistics' })
  async getPlatformStats() {
    return this.adminService.getPlatformStats();
  }
}
