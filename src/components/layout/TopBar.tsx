'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';
import { isMarketOpen } from '@/lib/utils';

export default function TopBar() {
  const [now, setNow] = useState<Date | null>(null);
  const marketOpen = now ? isMarketOpen(now) : false;

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-secondary px-4 md:px-6">
      <div className="font-mono text-sm font-bold tracking-wider text-text-primary md:hidden">
        DARK RECON
      </div>

      <div className="hidden md:block" />

      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${marketOpen ? 'bg-accent-green animate-pulse-dot' : 'bg-accent-red'}`}
          />
          <span className="font-mono text-xs uppercase tracking-wider text-text-secondary">
            {marketOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {now && (
          <time className="hidden font-mono text-xs text-text-secondary sm:block">
            {format(now, 'EEE, MMM d · HH:mm:ss')}
          </time>
        )}

        <button
          className="relative rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
