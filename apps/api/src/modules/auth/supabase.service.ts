import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client!: SupabaseClient;
  private adminClient!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('app.supabase.url');
    const anonKey = this.config.get<string>('app.supabase.anonKey');
    const serviceKey = this.config.get<string>('app.supabase.serviceRoleKey');

    if (!url || !anonKey) {
      this.logger.warn('Supabase credentials not configured — running in limited mode');
      return;
    }

    this.client = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (serviceKey) {
      this.adminClient = createClient(url, serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }

    this.logger.log('Supabase client initialized');
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getAdminClient(): SupabaseClient {
    return this.adminClient || this.client;
  }

  async verifyToken(token: string) {
    const { data, error } = await this.client.auth.getUser(token);
    if (error) throw error;
    return data.user;
  }
}
