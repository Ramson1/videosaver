'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Download, Moon, Sun, Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-dark">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
            <Download className="w-4 h-4 text-white" />
          </div>
          VideoSaver
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/download" className="text-white/60 hover:text-white transition-colors">Download</Link>
          <Link href="/history" className="text-white/60 hover:text-white transition-colors">History</Link>
          <Link href="/dashboard" className="text-white/60 hover:text-white transition-colors">Dashboard</Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors">Sign in</Link>
          <Link
            href="/register"
            className="text-sm px-4 py-2 rounded-lg bg-gradient-brand hover:opacity-90 transition-opacity"
          >
            Sign up
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden glass-dark border-t border-white/5 p-4 space-y-3">
          <Link href="/download" className="block py-2 text-white/60" onClick={() => setMobileOpen(false)}>Download</Link>
          <Link href="/history" className="block py-2 text-white/60" onClick={() => setMobileOpen(false)}>History</Link>
          <Link href="/dashboard" className="block py-2 text-white/60" onClick={() => setMobileOpen(false)}>Dashboard</Link>
          <Link href="/login" className="block py-2 text-white/60" onClick={() => setMobileOpen(false)}>Sign in</Link>
          <Link href="/register" className="block py-2 text-brand-400" onClick={() => setMobileOpen(false)}>Sign up</Link>
        </div>
      )}
    </header>
  );
}
