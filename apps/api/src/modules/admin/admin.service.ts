import { Injectable, Logger, Optional } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly supabase: SupabaseService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  /**
   * Get admin dashboard statistics.
   */
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];

    const [
      totalUsers,
      todayDownloads,
      queueStats,
      totalStorage,
    ] = await Promise.all([
      this.supabase.getAdminClient().from('users').select('id', { count: 'exact', head: true }),
      this.supabase
        .getAdminClient()
        .from('downloads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`),
      this.queueService ? this.queueService.getQueueStats() : Promise.resolve({ download: { waiting: 0, active: 0, completed: 0, failed: 0 }, metadata: { waiting: 0, active: 0 }, processing: { waiting: 0, active: 0 } }),
      this.supabase.getAdminClient().from('downloads').select('file_size_bytes').eq('status', 'completed'),
    ]);

    const totalBytes = (totalStorage.data || []).reduce(
      (sum, d) => sum + (d.file_size_bytes || 0),
      0,
    );

    return {
      users: { total: totalUsers.count || 0 },
      downloads: { today: todayDownloads.count || 0 },
      storage: { totalBytes, totalMb: Math.round(totalBytes / 1024 / 1024) },
      queue: queueStats,
    };
  }

  /**
   * Get user management list.
   */
  async getUsers(page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await this.supabase
      .getAdminClient()
      .from('users')
      .select('id, email, display_name, tier, is_active, daily_download_count, total_downloads, created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger.error(`Failed to fetch users: ${error.message}`);
      return { users: [], total: 0, page, limit };
    }

    return { users: data, total: count || 0, page, limit };
  }

  /**
   * Get platform-specific analytics.
   */
  async getPlatformStats() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('platforms')
      .select('name, display_name, daily_downloads, total_downloads, is_available')
      .order('total_downloads', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch platform stats: ${error.message}`);
      return [];
    }

    return data;
  }
}
