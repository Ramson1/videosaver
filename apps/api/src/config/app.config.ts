import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'downloads',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  rateLimit: {
    guest: parseInt(process.env.RATE_LIMIT_GUEST_DAILY || '10', 10),
    user: parseInt(process.env.RATE_LIMIT_USER_DAILY || '100', 10),
    premium: parseInt(process.env.RATE_LIMIT_PREMIUM_DAILY || '-1', 10),
  },

  storage: {
    tempDir: process.env.STORAGE_TEMP_DIR || './tmp/downloads',
    maxFileSizeMb: parseInt(process.env.STORAGE_MAX_FILE_SIZE_MB || '500', 10),
    cleanupIntervalHours: parseInt(process.env.STORAGE_CLEANUP_INTERVAL_HOURS || '24', 10),
    signedUrlExpirySeconds: parseInt(process.env.STORAGE_SIGNED_URL_EXPIRY_SECONDS || '3600', 10),
  },

  ffmpeg: {
    path: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  },

  queue: {
    concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '5', 10),
    maxRetries: parseInt(process.env.BULLMQ_MAX_RETRIES || '3', 10),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  },
}));
