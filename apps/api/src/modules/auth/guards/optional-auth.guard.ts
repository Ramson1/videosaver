import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Guard that allows both authenticated and guest users.
 * Sets request.user to the authenticated user or a guest user object.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        try {
          request.user = await this.authService.validateUser(token);
          request.isGuest = false;
          return true;
        } catch {
          // Token invalid — fall through to guest
        }
      }
    }

    request.user = this.authService.createGuestUser();
    request.isGuest = true;
    return true;
  }
}
