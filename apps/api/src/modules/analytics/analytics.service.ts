import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';
import { Platform } from '../../common/interfaces/platform.interface';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Record a download event.
   */
  async recordDownload(data: {
    userId?: string;
    platform: Platform;
    mediaId: string;
    jobId: string;
    sourceUrl: string;
    quality: string;
    format: string;
    fileSize?: number;
    duration?: number;
    processingTimeMs?: number;
    ipAddress?: string;
  }): Promise<void> {
    try {
      // Get platform ID
      const { data: platformData } = await this.supabase
        .getAdminClient()
        .from('platforms')
        .select('id')
        .eq('name', data.platform)
        .single();

      await this.supabase.getAdminClient().from('downloads').insert({
        user_id: data.userId || null,
        platform_id: platformData?.id || null,
        job_id: data.jobId,
        source_url: data.sourceUrl,
        normalized_url: data.sourceUrl,
        media_id: data.mediaId,
        media_type: 'video',
        quality: data.quality,
        format: data.format,
        file_size_bytes: data.fileSize || 0,
        duration_seconds: data.duration || 0,
        status: 'completed',
        processing_time_ms: data.processingTimeMs,
        ip_address: data.ipAddress,
        completed_at: new Date().toISOString(),
      });

      // Update platform counters
      if (platformData?.id) {
        await this.supabase
          .getAdminClient()
          .from('platforms')
          .update({
            daily_downloads: (this.supabase.getAdminClient() as any).rpc?.('increment', {
              table_name: 'platforms',
              column_name: 'daily_downloads',
              row_id: platformData.id,
            }),
          } as any)
          .eq('id', platformData.id);
      }
    } catch (error) {
      this.logger.error(`Failed to record analytics: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  /**
   * Record a failed download.
   */
  async recordFailure(data: {
    userId?: string;
    platform: Platform;
    jobId: string;
    sourceUrl: string;
    error: string;
  }): Promise<void> {
    try {
      const { data: platformData } = await this.supabase
        .getAdminClient()
        .from('platforms')
        .select('id')
        .eq('name', data.platform)
        .single();

      await this.supabase.getAdminClient().from('downloads').insert({
        user_id: data.userId || null,
        platform_id: platformData?.id || null,
        job_id: data.jobId,
        source_url: data.sourceUrl,
        normalized_url: data.sourceUrl,
        media_id: '',
        media_type: 'video',
        quality: 'unknown',
        format: 'unknown',
        status: 'failed',
        error_message: data.error,
      });
    } catch (error) {
      this.logger.error(`Failed to record failure: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  /**
   * Get daily statistics.
   */
  async getDailyStats(date: string = new Date().toISOString().split('T')[0]) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('downloads')
      .select('status, platform_id, file_size_bytes, processing_time_ms')
      .gte('created_at', `${date}T00:00:00`)
      .lt('created_at', `${date}T23:59:59`);

    if (error) {
      this.logger.error(`Failed to get daily stats: ${error.message}`);
      return null;
    }

    const total = data?.length || 0;
    const successful = data?.filter((d) => d.status === 'completed').length || 0;
    const failed = data?.filter((d) => d.status === 'failed').length || 0;
    const totalBytes = data?.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0) || 0;
    const avgProcessing = data?.reduce((sum, d) => sum + (d.processing_time_ms || 0), 0) / (total || 1) || 0;

    return { date, total, successful, failed, totalBytes, avgProcessingMs: Math.round(avgProcessing) };
  }
}
