'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, Check } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { GlassCard } from '@/components/ui/glass-card';
import { UrlInput } from '@/components/download/url-input';
import { useDownload } from '@/hooks/use-download';
import { toast } from 'sonner';

export default function DownloadPage() {
  const [url, setUrl] = useState('');
  const { metadata, downloadResult, isFetchingMetadata, isDownloading, getMetadata, download, reset } = useDownload();

  const handleSubmit = async () => {
    if (!url.trim()) return toast.error('Please enter a URL');
    await getMetadata(url);
  };

  const handleDownload = async (quality?: string) => {
    await download(url, quality);
  };

  const videoFormats = metadata?.formats?.filter(f => f.vcodec && f.vcodec !== 'none') || [];
  const audioFormats = metadata?.formats?.filter(f => f.acodec && f.acodec !== 'none') || [];

  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Download <span className="text-gradient">Media</span>
            </h1>
            <p className="text-white/50">Paste a link from YouTube, TikTok, Twitter, Instagram, and more</p>
          </motion.div>

          {/* URL Input */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <GlassCard className="p-6 mb-8">
              <UrlInput value={url} onChange={setUrl} onSubmit={handleSubmit} isLoading={isFetchingMetadata} />
            </GlassCard>
          </motion.div>

          {/* Loading */}
          <AnimatePresence>
            {isFetchingMetadata && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <GlassCard className="p-8 text-center mb-8">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-4" />
                  <p className="text-white/60">Fetching video info...</p>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Metadata + Quality Selection */}
          <AnimatePresence>
            {metadata && !isFetchingMetadata && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                <GlassCard className="p-6">
                  <div className="flex gap-4">
                    {metadata.thumbnail && (
                      <img src={metadata.thumbnail} alt="" className="w-32 h-20 object-cover rounded-lg" />
                    )}
                    <div>
                      <h2 className="font-semibold text-white line-clamp-2">{metadata.title}</h2>
                      {metadata.uploader && <p className="text-sm text-white/50 mt-1">{metadata.uploader}</p>}
                      {metadata.duration && (
                        <p className="text-xs text-white/30 mt-1">{Math.floor(metadata.duration / 60)}:{(metadata.duration % 60).toString().padStart(2, '0')}</p>
                      )}
                    </div>
                  </div>
                </GlassCard>

                {/* Video formats */}
                {videoFormats.length > 0 && (
                  <GlassCard className="p-6">
                    <h3 className="font-medium text-white mb-4">Video</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {videoFormats.slice(0, 8).map((f) => (
                        <button
                          key={f.format_id}
                          onClick={() => handleDownload(f.format_id)}
                          disabled={isDownloading}
                          className="px-3 py-2 rounded-lg bg-white/5 hover:bg-brand-500/20 border border-white/10 hover:border-brand-400/50 text-white text-sm transition-colors disabled:opacity-50"
                        >
                          {f.resolution || f.ext}
                          {f.filesize && <span className="block text-xs text-white/30">{Math.round(f.filesize / 1024 / 1024)}MB</span>}
                        </button>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Audio formats */}
                {audioFormats.length > 0 && (
                  <GlassCard className="p-6">
                    <h3 className="font-medium text-white mb-4">Audio</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {audioFormats.slice(0, 4).map((f) => (
                        <button
                          key={f.format_id}
                          onClick={() => handleDownload(f.format_id)}
                          disabled={isDownloading}
                          className="px-3 py-2 rounded-lg bg-white/5 hover:bg-brand-500/20 border border-white/10 hover:border-brand-400/50 text-white text-sm transition-colors disabled:opacity-50"
                        >
                          {f.ext} audio
                        </button>
                      ))}
                    </div>
                  </GlassCard>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Downloading */}
          <AnimatePresence>
            {isDownloading && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <GlassCard className="p-8 text-center mt-8">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-4" />
                  <p className="text-white/60">Downloading video...</p>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download complete */}
          <AnimatePresence>
            {downloadResult && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <GlassCard className="p-6 mt-8 border-green-500/30 bg-green-500/5">
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-400" />
                    <div>
                      <p className="font-medium text-green-300">Download complete</p>
                      <p className="text-sm text-white/50">{downloadResult.filename}</p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {downloadResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-6">
              <button onClick={() => { reset(); setUrl(''); }} className="text-sm text-white/40 hover:text-white/60 transition-colors">
                Download another
              </button>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
