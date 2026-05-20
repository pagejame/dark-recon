import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'green' | 'red' | 'blue' | 'yellow' | 'muted';
}

const variantStyles = {
  default: 'bg-bg-elevated text-text-secondary border-border',
  green: 'bg-accent-green-dim text-accent-green border-accent-green/30',
  red: 'bg-accent-red-dim text-accent-red border-accent-red/30',
  blue: 'bg-accent-blue-dim text-accent-blue border-accent-blue/30',
  yellow: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  muted: 'bg-bg-elevated text-text-muted border-border',
};

export default function Badge({
  className,
  variant = 'default',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
