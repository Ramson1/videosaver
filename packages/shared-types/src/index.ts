export enum Platform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
  PINTEREST = 'pinterest',
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
  SNAPCHAT = 'snapchat',
  WHATSAPP = 'whatsapp',
  UNKNOWN = 'unknown',
}

export enum MediaType {
  VIDEO = 'video',
  IMAGE = 'image',
  AUDIO = 'audio',
  CAROUSEL = 'carousel',
  GIF = 'gif',
}

export enum Quality {
  ORIGINAL = 'original',
  HIGHEST = 'highest',
  P1080 = '1080p',
  P720 = '720p',
  P480 = '480p',
  P360 = '360p',
  AUDIO_ONLY = 'audio_only',
}

export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  METADATA = 'metadata',
  DOWNLOADING = 'downloading',
  PROCESSING = 'processing',
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum UserTier {
  GUEST = 'guest',
  FREE = 'free',
  PREMIUM = 'premium',
  ADMIN = 'admin',
}

export interface MediaVariant {
  quality: Quality;
  url: string;
  fileSize?: number;
  format: string;
  hasAudio: boolean;
  hasVideo: boolean;
  width?: number;
  height?: number;
}

export interface MediaMetadata {
  platform: Platform;
  mediaId: string;
  title: string;
  description?: string;
  author: {
    name: string;
    username?: string;
    avatarUrl?: string;
    profileUrl?: string;
  };
  thumbnailUrl?: string;
  duration?: number;
  mediaType: MediaType;
  variants: MediaVariant[];
  sourceUrl: string;
  isDownloadable: boolean;
  restrictionReason?: string;
  extractedAt: Date;
}

export interface DownloadResult {
  jobId: string;
  platform: Platform;
  mediaId: string;
  title: string;
  quality: Quality;
  filePath: string;
  fileSize: number;
  format: string;
  thumbnailPath?: string;
  storageUrl: string;
  signedUrl: string;
  signedUrlExpiresAt: Date;
  duration?: number;
  completedAt: Date;
}

export interface ParsedUrl {
  originalUrl: string;
  platform: Platform;
  mediaId: string;
  normalizedUrl: string;
  isValid: boolean;
  error?: string;
}
