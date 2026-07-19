'use client';

import { motion } from 'framer-motion';
import { Download, HardDrive, TrendingUp, Clock, Star, Settings } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { GlassCard } from '@/components/ui/glass-card';

export default function DashboardPage() {
  const stats = [
    { label: 'Downloads Today', value: '7', icon: Download, color: 'text-blue-400' },
    { label: 'Total Downloads', value: '234', icon: TrendingUp, color: 'text-green-400' },
    { label: 'Storage Used', value: '1.2 GB', icon: HardDrive, color: 'text-purple-400' },
    { label: 'Favorites', value: '18', icon: Star, color: 'text-yellow-400' },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-white/50 mb-8">Welcome back! Here&apos;s your overview.</p>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <GlassCard className="p-6">
                  <stat.icon className={`w-8 h-8 ${stat.color} mb-3`} />
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-white/50">{stat.label}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Recent Activity */}
            <div className="lg:col-span-2">
              <GlassCard className="p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" /> Recent Activity
                </h2>
                <div className="space-y-3">
                  {['Instagram Reel', 'TikTok Video', 'YouTube Short'].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                      <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center text-sm">
                        {i === 0 ? '📸' : i === 1 ? '🎵' : '▶️'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item}</p>
                        <p className="text-xs text-white/40">2 minutes ago</p>
                      </div>
                      <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">Completed</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {/* Quick Actions */}
            <div>
              <GlassCard className="p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5" /> Quick Actions
                </h2>
                <div className="space-y-2">
                  {['Edit Profile', 'View Favorites', 'Download History', 'Settings'].map((action) => (
                    <button key={action} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm">
                      {action}
                    </button>
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
