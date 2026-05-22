'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import type { MorningBriefing as MorningBriefingData } from '@/lib/agents/briefing';

interface EarningsItem {
  symbol: string;
  date: string;
}

interface MarketStatusBarProps {
  briefing: MorningBriefingData | null;
  earnings: EarningsItem[];
  spyDisplay?: string | null;
}

function isMarketOpenET(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 570 && minutes < 960;
}

function formatETTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function daysUntil(dateStr: string) {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function MarketStatusBar({ briefing, earnings, spyDisplay }: MarketStatusBarProps) {
  const [etTime, setEtTime] = useState('');
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      setEtTime(formatETTime(new Date()));
      setMarketOpen(isMarketOpenET());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const vixLevel = briefing?.key_levels?.find((l) =>
    l.label.toLowerCase().includes('vix')
  )?.value;

  const upcoming = earnings
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];

  const nextEarningsLabel = upcoming
    ? `Next earnings: ${upcoming.symbol} in ${daysUntil(upcoming.date)} day${daysUntil(upcoming.date) === 1 ? '' : 's'}`
    : 'Next earnings: —';

  const spyLevel = briefing?.key_levels?.find((l) =>
    l.label.toLowerCase().includes('spy')
  );
  const spyLabel = spyDisplay || (spyLevel ? `SPY ${spyLevel.value}` : 'SPY —');

  const itemStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: '#7a8fa8',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      className="[-webkit-overflow-scrolling:touch]"
      style={{
        background: '#0d1117',
        border: '1px solid #1e2a3a',
        borderRadius: 10,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 16px',
        overflowX: 'auto',
      }}
    >
      <span
        style={{
          ...itemStyle,
          color: marketOpen ? '#00ff88' : '#ff3d5a',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: marketOpen ? '#00ff88' : '#ff3d5a',
            animation: marketOpen ? 'pulse 2s infinite' : undefined,
          }}
        />
        MARKET: {marketOpen ? 'OPEN' : 'CLOSED'}
      </span>
      <span style={{ color: '#1e2a3a' }}>|</span>
      <span style={itemStyle}>TIME ET: {etTime || '—'}</span>
      <span style={{ color: '#1e2a3a' }}>|</span>
      <span style={{ ...itemStyle, color: '#e8edf5' }}>{spyLabel}</span>
      <span style={{ color: '#1e2a3a' }}>|</span>
      <span style={itemStyle}>VIX {vixLevel || '—'}</span>
      <span style={{ color: '#1e2a3a' }}>|</span>
      <span style={itemStyle}>{nextEarningsLabel}</span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
