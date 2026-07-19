import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { UserTier } from '../../common/interfaces/platform.interface';

export interface AuthUser {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  tier: UserTier;
  isAdmin: boolean;
  dailyDownloads: number;
  totalDownloads: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Verify a Bearer token and return the authenticated user.
   */
  async validateUser(token: string): Promise<AuthUser> {
    try {
      const supabaseUser = await this.supabase.verifyToken(token);

      if (!supabaseUser) {
        throw new UnauthorizedException('Invalid token');
      }

      // Fetch user profile from database
      const { data: profile, error } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('*')
        .eq('auth_provider_id', supabaseUser.id)
        .single();

      if (error || !profile) {
        // Create user profile if it doesn't exist (first login)
        return this.createProfile(supabaseUser);
      }

      return {
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        tier: profile.tier as UserTier,
        isAdmin: profile.is_admin,
        dailyDownloads: profile.daily_download_count,
        totalDownloads: profile.total_downloads,
      };
    } catch (error) {
      this.logger.warn(`Auth validation failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Create a guest user session.
   */
  createGuestUser(): AuthUser {
    return {
      id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      tier: UserTier.GUEST,
      isAdmin: false,
      dailyDownloads: 0,
      totalDownloads: 0,
    };
  }

  /**
   * Check if user has reached their download limit.
   */
  checkDownloadLimit(user: AuthUser): { allowed: boolean; remaining: number; limit: number } {
    const limits: Record<UserTier, number> = {
      [UserTier.GUEST]: 10,
      [UserTier.FREE]: 100,
      [UserTier.PREMIUM]: -1,
      [UserTier.ADMIN]: -1,
    };

    const limit = limits[user.tier];

    if (limit === -1) {
      return { allowed: true, remaining: -1, limit: -1 };
    }

    const remaining = Math.max(0, limit - user.dailyDownloads);
    return {
      allowed: remaining > 0,
      remaining,
      limit,
    };
  }

  /**
   * Increment user's download count.
   */
  async incrementDownloadCount(userId: string): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .from('users')
      .update({
        daily_download_count: (this.supabase.getClient() as any).rpc?.('increment_download', {
          user_id: userId,
        }),
        total_downloads: (this.supabase.getClient() as any).rpc?.('increment_total', {
          user_id: userId,
        }),
      } as any)
      .eq('id', userId);

    if (error) {
      this.logger.error(`Failed to increment download count for user ${userId}`, error);
    }
  }

  private async createProfile(supabaseUser: any): Promise<AuthUser> {
    const { data: newProfile, error } = await this.supabase
      .getAdminClient()
      .from('users')
      .insert({
        email: supabaseUser.email,
        auth_provider: supabaseUser.app_metadata?.provider || 'email',
        auth_provider_id: supabaseUser.id,
        display_name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0],
        avatar_url: supabaseUser.user_metadata?.avatar_url,
        tier: 'free',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create user profile', error);
      throw new UnauthorizedException('Failed to create user profile');
    }

    return {
      id: newProfile.id,
      email: newProfile.email,
      displayName: newProfile.display_name,
      avatarUrl: newProfile.avatar_url,
      tier: newProfile.tier as UserTier,
      isAdmin: newProfile.is_admin,
      dailyDownloads: 0,
      totalDownloads: 0,
    };
  }
}
