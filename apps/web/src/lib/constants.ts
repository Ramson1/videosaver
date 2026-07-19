export const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', icon: 'facebook', color: '#1877F2', domains: ['facebook.com', 'fb.watch'] },
  { id: 'instagram', name: 'Instagram', icon: 'instagram', color: '#E4405F', domains: ['instagram.com', 'instagr.am'] },
  { id: 'tiktok', name: 'TikTok', icon: 'tiktok', color: '#000000', domains: ['tiktok.com', 'vm.tiktok.com'] },
  { id: 'youtube', name: 'YouTube', icon: 'youtube', color: '#FF0000', domains: ['youtube.com', 'youtu.be'] },
  { id: 'twitter', name: 'X (Twitter)', icon: 'twitter', color: '#1DA1F2', domains: ['twitter.com', 'x.com'] },
  { id: 'pinterest', name: 'Pinterest', icon: 'pinterest', color: '#BD081C', domains: ['pinterest.com', 'pin.it'] },
  { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', color: '#0A66C2', domains: ['linkedin.com'] },
  { id: 'snapchat', name: 'Snapchat', icon: 'snapchat', color: '#FFFC00', domains: ['snapchat.com'] },
  { id: 'whatsapp', name: 'WhatsApp', icon: 'whatsapp', color: '#25D366', domains: ['whatsapp.com'] },
] as const;

export const QUALITY_OPTIONS = [
  { value: '1080p', label: '1080p', description: 'Full HD' },
  { value: '720p', label: '720p', description: 'HD' },
  { value: '480p', label: '480p', description: 'Standard' },
  { value: '360p', label: '360p', description: 'Low' },
  { value: 'audio_only', label: 'Audio Only', description: 'MP3/M4A' },
  { value: 'original', label: 'Original', description: 'Best available' },
] as const;

export const RATE_LIMITS = {
  guest: 10,
  free: 100,
  premium: -1,
} as const;

export const APP_NAME = 'VideoSaver';
export const APP_DESCRIPTION = 'Download videos from any platform';
