'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { getTimeUntilMarketOpen, isMarketOpen } from '@/lib/utils';

export default function MorningBriefing() {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0 });
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setMarketOpen(isMarketOpen(now));
      if (!isMarketOpen(now)) {
        setCountdown(getTimeUntilMarketOpen(now));
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card accent="green" className="relative overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-text-primary">
            Morning Briefing
          </h2>
          <p className="text-sm text-text-secondary">
            {marketOpen
              ? 'Markets are open. Your briefing will update at 6AM ET tomorrow.'
              : `Your 6AM briefing will appear here. Market opens in ${countdown.hours}h ${countdown.minutes}m.`}
          </p>
        </div>
        <Badge variant="muted">Briefing Agent — Standby</Badge>
      </div>
    </Card>
  );
}
