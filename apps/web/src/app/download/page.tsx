'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Link as LinkIcon, Loader2, AlertCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { GlassCard } from '@/components/ui/glass-card';
import { GradientButton } from '@/components/ui/gradient-button';
import { UrlInput } from '@/components/download/url-input';
import { MetadataPreview } from '@/components/download/metadata-preview';
import { QualitySelector } from '@/components/download/quality-selector';
import { DownloadProgress } from '@/components/download/download-progress';
import { useDownload } from '@/hooks/use-download';
import { toast } from 'sonner';

export default function DownloadPage() {
  const [url, setUrl] = useState('');
  const { metadata, isExtracting, isDownloading, downloadProgress, extractMetadata, startDownload, reset } = useDownload();

  const handleSubmit = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }
    await extractMetadata(url);
  };

  const handleDownload = async (quality: string) => {
    await startDownload(url, quality);
  };

  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Download <span className="text-gradient">Media</span>
            </h1>
            <p className="text-white/50">Paste a link from any supported platform</p>
          </motion.div>

          {/* URL Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard className="p-6 mb-8">
              <UrlInput
                value={url}
                onChange={setUrl}
                onSubmit={handleSubmit}
                isLoading={isExtracting}
              />
            </GlassCard>
          </motion.div>

          {/* Loading State */}
          <AnimatePresence>
            {isExtracting && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <GlassCard className="p-8 text-center mb-8">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-4" />
                  <p className="text-white/60">Extracting media information...</p>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Metadata Preview */}
          <AnimatePresence>
            {metadata && !isDownloading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <MetadataPreview metadata={metadata} />

                {metadata.isDownloadable ? (
                  <>
                    <QualitySelector
                      variants={metadata.variants}
                      onSelect={handleDownload}
                    />
                  </>
                ) : (
                  <GlassCard className="p-6 border-red-500/30 bg-red-500/5">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-300">Cannot download this content</p>
                        <p className="text-sm text-white/50 mt-1">{metadata.restrictionReason}</p>
                      </div>
                    </div>
                  </GlassCard>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download Progress */}
          <AnimatePresence>
            {isDownloading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <DownloadProgress progress={downloadProgress} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <Footer />
    </>
  );
}
