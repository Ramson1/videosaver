import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Invalid token format');
    }

    const user = await this.authService.validateUser(token);
    request.user = user;
    return true;
  }
}
