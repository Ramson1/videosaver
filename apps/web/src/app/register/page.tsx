'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { GlassCard } from '@/components/ui/glass-card';
import { GradientButton } from '@/components/ui/gradient-button';

export default function RegisterPage() {
  const [name, setName] = useState('');
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
            <h1 className="text-2xl font-bold mb-2 text-center">Create account</h1>
            <p className="text-white/50 text-center mb-8">Get 100 free downloads per day</p>

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all text-sm"
                  />
                </div>
              </div>

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
                    placeholder="Min 8 characters"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <GradientButton className="w-full gap-2 justify-center" size="lg">
                Create Account <ArrowRight className="w-4 h-4" />
              </GradientButton>
            </form>

            <div className="mt-6 text-center text-sm text-white/40">
              Already have an account?{' '}
              <Link href="/login" className="text-brand-400 hover:underline">Sign in</Link>
            </div>
          </GlassCard>
        </motion.div>
      </main>
    </>
  );
}
