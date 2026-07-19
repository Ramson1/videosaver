import { Controller, Post, Get, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify auth token and return user profile' })
  async verify(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return { user: this.authService.createGuestUser(), isGuest: true };
    }
    const user = await this.authService.validateUser(token);
    return { user, isGuest: false };
  }

  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a guest session' })
  createGuest() {
    return { user: this.authService.createGuestUser(), isGuest: true };
  }

  @Get('limits')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check download limits for current user' })
  async checkLimits(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    const user = token
      ? await this.authService.validateUser(token)
      : this.authService.createGuestUser();

    return this.authService.checkDownloadLimit(user);
  }
}
