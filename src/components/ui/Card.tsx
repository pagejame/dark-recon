import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: 'green' | 'blue' | 'red' | 'orange' | 'yellow' | 'none';
}

const accentStyles = {
  green: 'border-l-2 border-l-accent-green',
  blue: 'border-l-2 border-l-accent-blue',
  red: 'border-l-2 border-l-accent-red',
  orange: 'border-l-2 border-l-accent-orange',
  yellow: 'border-l-2 border-l-accent-yellow',
  none: '',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, accent = 'none', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-border bg-bg-card p-4 md:p-5',
          accentStyles[accent],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
