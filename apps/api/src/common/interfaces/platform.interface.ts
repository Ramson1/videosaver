/**
 * Supported platform identifiers.
 */
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

/**
 * Media type classification.
 */
export enum MediaType {
  VIDEO = 'video',
  IMAGE = 'image',
  AUDIO = 'audio',
  CAROUSEL = 'carousel',
  GIF = 'gif',
}

/**
 * Quality levels for downloadable media.
 */
export enum Quality {
  ORIGINAL = 'original',
  HIGHEST = 'highest',
  P1080 = '1080p',
  P720 = '720p',
  P480 = '480p',
  P360 = '360p',
  AUDIO_ONLY = 'audio_only',
}

/**
 * A single downloadable media variant.
 */
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

/**
 * Metadata extracted from a media URL.
 */
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

/**
 * Result of a completed download.
 */
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

/**
 * Download job status.
 */
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

/**
 * User tier for rate limiting.
 */
export enum UserTier {
  GUEST = 'guest',
  FREE = 'free',
  PREMIUM = 'premium',
  ADMIN = 'admin',
}

/**
 * Parsed URL information.
 */
export interface ParsedUrl {
  originalUrl: string;
  platform: Platform;
  mediaId: string;
  normalizedUrl: string;
  isValid: boolean;
  error?: string;
}
