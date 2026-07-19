'use client';

import { Check, Download, Loader2, Upload, Cpu } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface DownloadProgressProps {
  progress: {
    step: 'metadata' | 'downloading' | 'processing' | 'uploading' | 'complete';
    percent: number;
    message?: string;
  };
}

const steps = [
  { key: 'metadata', label: 'Extracting metadata', icon: Loader2 },
  { key: 'downloading', label: 'Downloading media', icon: Download },
  { key: 'processing', label: 'Processing file', icon: Cpu },
  { key: 'uploading', label: 'Uploading to storage', icon: Upload },
  { key: 'complete', label: 'Complete!', icon: Check },
];

export function DownloadProgress({ progress }: DownloadProgressProps) {
  const currentStepIndex = steps.findIndex((s) => s.key === progress.step);

  return (
    <GlassCard className="p-6">
      <div className="space-y-4">
        {steps.map((step, i) => {
          const isComplete = i < currentStepIndex;
          const isCurrent = i === currentStepIndex;
          const isPending = i > currentStepIndex;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isComplete ? 'bg-green-500/20 text-green-400' :
                isCurrent ? 'bg-brand-500/20 text-brand-400' :
                'bg-white/5 text-white/20'
              }`}>
                {isComplete ? (
                  <Check className="w-4 h-4" />
                ) : isCurrent ? (
                  <step.icon className="w-4 h-4 animate-spin" />
                ) : (
                  <step.icon className="w-4 h-4" />
                )}
              </div>
              <span className={`text-sm ${isComplete ? 'text-green-400' : isCurrent ? 'text-white' : 'text-white/30'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-6">
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-brand rounded-full transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        {progress.message && (
          <p className="text-xs text-white/40 mt-2">{progress.message}</p>
        )}
      </div>
    </GlassCard>
  );
}
