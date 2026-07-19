import Link from 'next/link';
import { Download } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
                <Download className="w-4 h-4 text-white" />
              </div>
              VideoSaver
            </Link>
            <p className="text-sm text-white/40">Download media from any platform. Fast, free, and secure.</p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Product</h3>
            <div className="space-y-2">
              <Link href="/download" className="block text-sm text-white/40 hover:text-white/60 transition-colors">Downloader</Link>
              <Link href="/history" className="block text-sm text-white/40 hover:text-white/60 transition-colors">History</Link>
              <Link href="/dashboard" className="block text-sm text-white/40 hover:text-white/60 transition-colors">Dashboard</Link>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Platforms</h3>
            <div className="space-y-2">
              {['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter'].map((p) => (
                <span key={p} className="block text-sm text-white/40">{p}</span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Legal</h3>
            <div className="space-y-2">
              <span className="block text-sm text-white/40">Privacy Policy</span>
              <span className="block text-sm text-white/40">Terms of Service</span>
              <span className="block text-sm text-white/40">DMCA Policy</span>
              <span className="block text-sm text-white/40">Contact</span>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/30">&copy; {new Date().getFullYear()} VideoSaver. All rights reserved.</p>
          <p className="text-xs text-white/20">This tool is for personal use only. Respect content creators&apos; rights.</p>
        </div>
      </div>
    </footer>
  );
}
