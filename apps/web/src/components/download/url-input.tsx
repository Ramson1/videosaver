'use client';

import { Link as LinkIcon, Search, Loader2, ClipboardPaste } from 'lucide-react';
import { GradientButton } from '@/components/ui/gradient-button';

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function UrlInput({ value, onChange, onSubmit, isLoading }: UrlInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.startsWith('http')) {
        onChange(text);
      } else if (text) {
        onChange(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste a link here — e.g., https://www.instagram.com/reel/..."
          className="w-full pl-12 pr-24 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all text-base placeholder:text-white/20"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button
            onClick={handlePaste}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 hover:text-brand-200 transition-all text-sm font-medium"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="w-4 h-4" />
            Paste
          </button>
          {value && (
            <button
              onClick={() => onChange('')}
              className="text-white/30 hover:text-white/60 text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <GradientButton
        onClick={onSubmit}
        disabled={!value.trim() || isLoading}
        size="lg"
        className="w-full justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Detecting platform...
          </>
        ) : (
          <>
            <Search className="w-5 h-5" />
            Analyze Link
          </>
        )}
      </GradientButton>
    </div>
  );
}
