import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('app.redis.host', 'localhost');
    const port = this.config.get<number>('app.redis.port', 6379);
    const password = this.config.get<string>('app.redis.password');

    this.redis = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.redis.connect().catch((err) => {
      this.logger.warn(`Redis connection failed: ${err.message} — running without cache`);
    });
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache set failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Cache metadata for a URL to avoid repeated extraction.
   */
  async cacheMetadata(url: string, metadata: unknown): Promise<void> {
    const key = `metadata:${Buffer.from(url).toString('base64url')}`;
    await this.set(key, metadata, 600); // 10 minutes
  }

  async getCachedMetadata<T>(url: string): Promise<T | null> {
    const key = `metadata:${Buffer.from(url).toString('base64url')}`;
    return this.get<T>(key);
  }

  /**
   * Cache download links to avoid re-fetching.
   */
  async cacheDownloadLink(url: string, quality: string, link: string): Promise<void> {
    const key = `download:${quality}:${Buffer.from(url).toString('base64url')}`;
    await this.set(key, link, 1800); // 30 minutes
  }

  async getCachedDownloadLink(url: string, quality: string): Promise<string | null> {
    const key = `download:${quality}:${Buffer.from(url).toString('base64url')}`;
    return this.get<string>(key);
  }
}
