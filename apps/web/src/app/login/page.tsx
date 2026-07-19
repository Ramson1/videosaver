'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { GlassCard } from '@/components/ui/glass-card';
import { GradientButton } from '@/components/ui/gradient-button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center px-4 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <GlassCard className="p-8">
            <h1 className="text-2xl font-bold mb-2 text-center">Welcome back</h1>
            <p className="text-white/50 text-center mb-8">Sign in to your VideoSaver account</p>

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-white/60 mb-1 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <GradientButton className="w-full gap-2 justify-center" size="lg">
                Sign In <ArrowRight className="w-4 h-4" />
              </GradientButton>
            </form>

            <div className="mt-6 text-center text-sm text-white/40">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-brand-400 hover:underline">Sign up</Link>
            </div>

            <div className="mt-6 relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
              <div className="relative flex justify-center text-xs"><span className="px-2 text-white/30 bg-[#0f172a]">or continue with</span></div>
            </div>

            <button className="mt-4 w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </GlassCard>
        </motion.div>
      </main>
    </>
  );
}
