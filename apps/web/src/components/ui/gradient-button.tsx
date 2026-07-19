import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface GradientButtonProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function GradientButton({ children, className, size = 'md', onClick, disabled, type = 'button' }: GradientButtonProps) {
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'bg-gradient-brand hover:opacity-90 transition-all rounded-xl font-medium text-white shadow-glow disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center',
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
