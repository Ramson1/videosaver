'use client';

import { Clock, User, MonitorPlay, Film } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface MetadataPreviewProps {
  metadata: {
    title: string;
    author?: { name: string; username?: string };
    thumbnailUrl?: string;
    duration?: number;
    mediaType: string;
    platform: string;
  };
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MetadataPreview({ metadata }: MetadataPreviewProps) {
  return (
    <GlassCard className="p-6">
      <div className="flex gap-4">
        {metadata.thumbnailUrl && (
          <div className="w-32 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
            <img
              src={metadata.thumbnailUrl}
              alt={metadata.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold mb-2 line-clamp-2">{metadata.title}</h3>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/40">
            {metadata.author && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {metadata.author.name}
              </span>
            )}
            {metadata.duration ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(metadata.duration)}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Film className="w-3 h-3" />
              {metadata.mediaType}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 text-xs">
              {metadata.platform}
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
