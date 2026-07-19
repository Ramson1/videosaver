'use client';

import { motion } from 'framer-motion';
import { Users, Download, HardDrive, Activity, BarChart3 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { GlassCard } from '@/components/ui/glass-card';

export default function AdminPage() {
  const stats = [
    { label: 'Total Users', value: '12,847', icon: Users, change: '+12%' },
    { label: 'Downloads Today', value: '3,291', icon: Download, change: '+8%' },
    { label: 'Storage Used', value: '48.2 GB', icon: HardDrive, change: '+2.1 GB' },
    { label: 'Active Queue', value: '23', icon: Activity, change: '5 pending' },
  ];

  const platformData = [
    { name: 'Instagram', downloads: 1240, percentage: 38 },
    { name: 'TikTok', downloads: 890, percentage: 27 },
    { name: 'YouTube', downloads: 620, percentage: 19 },
    { name: 'Facebook', downloads: 310, percentage: 9 },
    { name: 'Twitter', downloads: 231, percentage: 7 },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-white/50 mb-8">System overview and management</p>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <stat.icon className="w-6 h-6 text-brand-400" />
                    <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{stat.change}</span>
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-white/50">{stat.label}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Platform Popularity */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" /> Platform Popularity
              </h2>
              <div className="space-y-4">
                {platformData.map((p) => (
                  <div key={p.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{p.name}</span>
                      <span className="text-white/50">{p.downloads.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${p.percentage}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full bg-gradient-brand rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Queue Monitoring */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5" /> Queue Status
              </h2>
              <div className="space-y-3">
                {[
                  { name: 'Active', count: 5, color: 'bg-blue-400' },
                  { name: 'Waiting', count: 18, color: 'bg-yellow-400' },
                  { name: 'Completed (24h)', count: 3291, color: 'bg-green-400' },
                  { name: 'Failed (24h)', count: 47, color: 'bg-red-400' },
                ].map((q) => (
                  <div key={q.name} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${q.color}`} />
                      <span className="text-sm">{q.name}</span>
                    </div>
                    <span className="font-mono text-sm">{q.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
