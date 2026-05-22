'use client';

import Link from 'next/link';

interface EarningsEvent {
  symbol: string;
  date: string;
  hour?: string;
}

interface CatalystsWidgetProps {
  earnings: EarningsEvent[];
  loading: boolean;
}

export default function CatalystsWidget({ earnings, loading }: CatalystsWidgetProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const formatDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const borderColor = (dateStr: string) => {
    if (dateStr === todayStr) return '#00ff88';
    if (dateStr === tomorrowStr) return '#ffd700';
    return '#1e2a3a';
  };

  const timing = (hour?: string) => {
    if (hour === 'bmo') return 'PRE';
    if (hour === 'amc') return 'POST';
    return 'TBD';
  };

  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderRadius: 10,
        padding: '16px 20px',
        height: '100%',
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#ff8c3d',
          }}
        >
          THIS WEEK&apos;S CATALYSTS
        </span>
        <Link
          href="/earnings"
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#00ff88',
            textDecoration: 'none',
          }}
        >
          View calendar →
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-28 shrink-0 animate-pulse rounded-full bg-bg-elevated" />
          ))}
        </div>
      ) : earnings.length === 0 ? (
        <p style={{ fontSize: 13, color: '#7a8fa8' }}>No watchlist earnings this week</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {earnings.map((event) => (
            <span
              key={`${event.symbol}-${event.date}`}
              className="rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-wide text-text-primary"
              style={{ borderColor: borderColor(event.date) }}
            >
              {event.symbol} · {formatDate(event.date)} · {timing(event.hour)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
