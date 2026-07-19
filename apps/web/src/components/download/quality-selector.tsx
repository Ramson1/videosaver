'use client';

import { Download, Music } from 'lucide-react';

interface QualitySelectorProps {
  variants: Array<{
    quality: string;
    format: string;
    hasVideo: boolean;
    hasAudio: boolean;
    width?: number;
    height?: number;
    fileSize?: number;
  }>;
  onSelect: (quality: string) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function QualitySelector({ variants, onSelect }: QualitySelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-white/60">Select Quality</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {variants.map((variant) => (
          <button
            key={variant.quality}
            onClick={() => onSelect(variant.quality)}
            className="glass-card p-4 text-left hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center gap-2 mb-1">
              {variant.hasVideo ? (
                <Download className="w-4 h-4 text-brand-400" />
              ) : (
                <Music className="w-4 h-4 text-green-400" />
              )}
              <span className="font-medium text-sm">{variant.quality}</span>
            </div>
            <div className="text-xs text-white/40">
              {variant.format.toUpperCase()}
              {variant.width && variant.height ? ` · ${variant.height}p` : ''}
              {variant.fileSize ? ` · ${formatFileSize(variant.fileSize)}` : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
