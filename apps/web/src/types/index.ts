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
  DOWNLOADING = 'downloading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
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
}

export interface DownloadResult {
  jobId: string;
  platform: Platform;
  mediaId: string;
  title: string;
  quality: Quality;
  fileSize: number;
  format: string;
  signedUrl: string;
}

export interface User {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  tier: 'guest' | 'free' | 'premium' | 'admin';
  isAdmin: boolean;
  dailyDownloads: number;
  totalDownloads: number;
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  platform: Platform;
  mediaType: MediaType;
  quality: string;
  format: string;
  fileSize?: number;
  status: JobStatus;
  createdAt: string;
  signedUrl?: string;
}
