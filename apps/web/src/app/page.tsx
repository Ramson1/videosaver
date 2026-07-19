'use client';

import { motion } from 'framer-motion';
import { Download, Zap, Shield, Globe, ArrowRight, Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { GlassCard } from '@/components/ui/glass-card';
import { GradientButton } from '@/components/ui/gradient-button';

const platforms = [
  { name: 'Facebook', icon: '📘', color: 'from-blue-500 to-blue-600' },
  { name: 'Instagram', icon: '📸', color: 'from-pink-500 to-purple-600' },
  { name: 'TikTok', icon: '🎵', color: 'from-gray-800 to-gray-900' },
  { name: 'YouTube', icon: '▶️', color: 'from-red-500 to-red-600' },
  { name: 'Twitter / X', icon: '🐦', color: 'from-sky-400 to-sky-500' },
  { name: 'Pinterest', icon: '📌', color: 'from-red-400 to-red-500' },
  { name: 'LinkedIn', icon: '💼', color: 'from-blue-600 to-blue-700' },
  { name: 'Snapchat', icon: '👻', color: 'from-yellow-400 to-yellow-500' },
];

const features = [
  { icon: Zap, title: 'Lightning Fast', desc: 'Download media in seconds with our optimized pipeline and global CDN.' },
  { icon: Shield, title: 'Secure & Private', desc: 'No data stored permanently. Signed URLs expire automatically.' },
  { icon: Globe, title: '9+ Platforms', desc: 'Support for all major social media platforms in one tool.' },
  { icon: Download, title: 'Multiple Qualities', desc: 'Choose from 360p to 1080p, audio-only, or original quality.' },
];

const steps = [
  { num: '01', title: 'Paste URL', desc: 'Copy the link from any supported platform and paste it in the input field.' },
  { num: '02', title: 'Preview & Select', desc: 'We extract metadata instantly. Choose your preferred quality and format.' },
  { num: '03', title: 'Download', desc: 'Click download and get your media file directly. It\'s that simple.' },
];

const faqs = [
  { q: 'Is VideoSaver free to use?', a: 'Yes! Guest users get 10 downloads per day. Create a free account for 100 downloads daily.' },
  { q: 'Which platforms are supported?', a: 'We support Facebook, Instagram, TikTok, YouTube, Twitter/X, Pinterest, LinkedIn, and Snapchat.' },
  { q: 'What video qualities are available?', a: 'We extract all available qualities from 360p up to 1080p, plus audio-only and original quality options.' },
  { q: 'Do I need to install anything?', a: 'No installation required. VideoSaver works entirely in your browser on any device.' },
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden">
        {/* Hero Section */}
        <section className="relative min-h-[90vh] flex items-center justify-center px-4 pt-20">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 via-transparent to-transparent" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 max-w-4xl mx-auto text-center"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 text-sm"
            >
              <Zap className="w-4 h-4 text-brand-400" />
              <span>Fast, free, no limits on quality</span>
            </motion.div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Download from{' '}
              <span className="text-gradient">any platform</span>
            </h1>

            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto">
              Save videos, reels, and images from Facebook, Instagram, TikTok, YouTube, and 5 more platforms.
              Paste a link, pick your quality, done.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/download">
                <GradientButton size="lg" className="gap-2">
                  <Download className="w-5 h-5" />
                  Start Downloading
                </GradientButton>
              </Link>
              <a href="#how-it-works">
                <button className="px-8 py-4 rounded-xl glass hover:bg-white/10 transition-all text-white font-medium">
                  See How It Works
                </button>
              </a>
            </div>

            <div className="mt-12 flex items-center justify-center gap-8 text-sm text-white/40">
              <span className="flex items-center gap-1"><Check className="w-4 h-4 text-green-400" /> No signup required</span>
              <span className="flex items-center gap-1"><Check className="w-4 h-4 text-green-400" /> 1080p support</span>
              <span className="flex items-center gap-1"><Check className="w-4 h-4 text-green-400" /> 9+ platforms</span>
            </div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Why choose VideoSaver?</h2>
              <p className="text-white/50 max-w-xl mx-auto">Built for speed, designed for everyone.</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <GlassCard className="p-6 h-full hover-lift">
                    <feature.icon className="w-10 h-10 text-brand-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-white/50 text-sm">{feature.desc}</p>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Supported Platforms */}
        <section className="py-24 px-4 bg-white/[0.02]">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Supported Platforms</h2>
              <p className="text-white/50">One tool for all your favorite platforms.</p>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {platforms.map((platform, i) => (
                <motion.div
                  key={platform.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GlassCard className="p-6 text-center hover-lift cursor-pointer">
                    <span className="text-4xl mb-3 block">{platform.icon}</span>
                    <span className="font-medium">{platform.name}</span>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
              <p className="text-white/50">Three simple steps.</p>
            </motion.div>

            <div className="space-y-8">
              {steps.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                >
                  <GlassCard className="p-8 flex items-start gap-6 hover-lift">
                    <span className="text-4xl font-bold text-gradient">{step.num}</span>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                      <p className="text-white/50">{step.desc}</p>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 px-4 bg-white/[0.02]">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">FAQ</h2>
            </motion.div>

            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-white/50 text-sm">{faq.a}</p>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <GlassCard className="p-12 bg-gradient-brand-subtle">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to download?</h2>
              <p className="text-white/50 mb-8">Paste a link and get your media in seconds.</p>
              <Link href="/download">
                <GradientButton size="lg" className="gap-2">
                  <Download className="w-5 h-5" />
                  Go to Downloader
                  <ArrowRight className="w-4 h-4" />
                </GradientButton>
              </Link>
            </GlassCard>
          </motion.div>
        </section>
      </main>
      <Footer />
    </>
  );
}
