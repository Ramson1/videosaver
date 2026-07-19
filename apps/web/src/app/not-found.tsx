import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl mb-8">Page not found</p>
        <Link href="/" className="text-brand-400 hover:text-brand-300 underline">
          Go back home
        </Link>
      </div>
    </div>
  );
}
