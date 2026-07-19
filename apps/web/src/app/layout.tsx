import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'VideoSaver — Download Videos from Any Platform',
    template: '%s | VideoSaver',
  },
  description:
    'Download videos, reels, and images from Facebook, Instagram, TikTok, YouTube, Twitter, and more. Fast, free, and no watermarks.',
  keywords: ['video downloader', 'save video', 'download reels', 'tiktok downloader', 'instagram saver'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'VideoSaver',
    title: 'VideoSaver — Download Videos from Any Platform',
    description: 'Fast, free media downloader supporting 9+ platforms.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VideoSaver',
    description: 'Download videos from any platform — fast and free.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Providers>
            {children}
          </Providers>
          <Toaster position="top-right" theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
