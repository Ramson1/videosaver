'use client';

import { motion } from 'framer-motion';
import { Clock, Download, Heart, Trash2, ExternalLink } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { GlassCard } from '@/components/ui/glass-card';

const mockHistory = [
  { id: '1', title: 'Amazing sunset timelapse', platform: 'Instagram', type: 'Reel', date: '2026-07-18', quality: '1080p', status: 'completed' },
  { id: '2', title: 'Cooking tutorial ep.42', platform: 'TikTok', type: 'Video', date: '2026-07-18', quality: '720p', status: 'completed' },
  { id: '3', title: 'Product launch keynote', platform: 'YouTube', type: 'Video', date: '2026-07-17', quality: '1080p', status: 'completed' },
  { id: '4', title: 'Weekend vibes photo', platform: 'Facebook', type: 'Photo', date: '2026-07-17', quality: 'Original', status: 'completed' },
  { id: '5', title: 'News clip', platform: 'Twitter', type: 'Video', date: '2026-07-16', quality: '720p', status: 'failed' },
];

export default function HistoryPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-bold mb-2">Download History</h1>
            <p className="text-white/50 mb-8">Your recent downloads</p>
          </motion.div>

          <div className="space-y-3">
            {mockHistory.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard className="p-4 flex items-center gap-4 hover-lift">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl">
                    {item.platform === 'Instagram' ? '📸' : item.platform === 'TikTok' ? '🎵' : item.platform === 'YouTube' ? '▶️' : item.platform === 'Facebook' ? '📘' : '🐦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-3 text-sm text-white/40">
                      <span>{item.platform}</span>
                      <span>{item.quality}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'completed' ? (
                      <>
                        <button className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Re-download">
                          <Download className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Favorite">
                          <Heart className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded-full">Failed</span>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
