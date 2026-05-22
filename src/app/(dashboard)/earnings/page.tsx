'use client';

import { useState, useEffect, useCallback } from 'react';

interface EarningsEvent {
  symbol: string;
  date: string;
  hour: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  quarter: number;
  year: number;
}

interface ThesisPreview {
  overall_direction: string;
  conviction_score: number;
  options_setup: { recommended_play: string; expiration: string };
  dark_recon_verdict: string;
  bull_case: { price_target: string };
  bear_case: { downside_target: string };
}

const WATCHLIST_DEFAULT = ['NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'SPY', 'QQQ'];

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [filter, setFilter] = useState<'all' | 'watchlist'>('watchlist');
  const [buildingThesis, setBuildingThesis] = useState<string | null>(null);
  const [thesisResults, setThesisResults] = useState<Record<string, ThesisPreview>>({});

  const fetchEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/earnings?days=${days}`);
      const data = await res.json();
      setEarnings(data.earnings || []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const buildEarningsThesis = async (symbol: string) => {
    setBuildingThesis(symbol);
    try {
      const res = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: symbol }),
      });
      const data = await res.json();
      if (res.ok) setThesisResults((prev) => ({ ...prev, [symbol]: data }));
    } catch {
      // silent fail
    } finally {
      setBuildingThesis(null);
    }
  };

  const filteredEarnings =
    filter === 'watchlist'
      ? earnings.filter((e) => WATCHLIST_DEFAULT.includes(e.symbol))
      : earnings;

  const groupedByDate = filteredEarnings.reduce(
    (acc, e) => {
      if (!acc[e.date]) acc[e.date] = [];
      acc[e.date].push(e);
      return acc;
    },
    {} as Record<string, EarningsEvent[]>
  );

  const getDayLabel = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    if (diff === -1) return 'YESTERDAY';
    return date
      .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      .toUpperCase();
  };

  const isToday = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
  };

  const isTomorrow = (dateStr: string) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    return dateStr === tomorrow;
  };

  const directionColor = (d: string) =>
    d === 'bullish' ? '#00ff88' : d === 'bearish' ? '#ff3d5a' : '#ffd700';

  return (
    <div className="mx-auto max-w-[1000px] px-3.5 py-6 md:p-6">
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#00ff88',
            marginBottom: 6,
          }}
        >
          ◆ DARK RECON
        </div>
        <h1
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 24,
            fontWeight: 800,
            color: '#e8edf5',
            margin: 0,
          }}
        >
          Earnings Calendar
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Upcoming catalysts — options plays to prepare now
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2.5">
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#7a8fa8',
            letterSpacing: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          SHOW:
        </div>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${days === d ? '#00ff88' : '#1e2a3a'}`,
              background: days === d ? '#00ff8815' : '#111620',
              color: days === d ? '#00ff88' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {d} DAYS
          </button>
        ))}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#7a8fa8',
            letterSpacing: 2,
            display: 'flex',
            alignItems: 'center',
            marginLeft: 8,
          }}
        >
          FILTER:
        </div>
        {(['watchlist', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${filter === f ? '#3d9aff' : '#1e2a3a'}`,
              background: filter === f ? '#3d9aff15' : '#111620',
              color: filter === f ? '#3d9aff' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          LOADING EARNINGS CALENDAR...
        </div>
      ) : Object.keys(groupedByDate).length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          NO EARNINGS IN WATCHLIST THIS PERIOD — TRY &quot;ALL&quot; FILTER
        </div>
      ) : (
        Object.entries(groupedByDate).map(([date, events]) => (
          <div key={date} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 3,
                  fontWeight: 700,
                  color: isToday(date) ? '#00ff88' : isTomorrow(date) ? '#ffd700' : '#7a8fa8',
                }}
              >
                {getDayLabel(date)}
              </div>
              <div style={{ flex: 1, height: 1, background: '#1e2a3a' }} />
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                {events.length} reports
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map((event, i) => {
                const thesis = thesisResults[event.symbol];
                const isBuilding = buildingThesis === event.symbol;

                return (
                  <div
                    key={`${event.symbol}-${i}`}
                    style={{
                      background: '#111620',
                      border: `1px solid ${isToday(date) ? '#00ff8830' : '#1e2a3a'}`,
                      borderLeft: `3px solid ${isToday(date) ? '#00ff88' : isTomorrow(date) ? '#ffd700' : '#1e2a3a'}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 16,
                          fontWeight: 700,
                          color: '#ffd700',
                          minWidth: 70,
                        }}
                      >
                        {event.symbol}
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          color: event.hour === 'bmo' ? '#3d9aff' : '#ff8c3d',
                          background: event.hour === 'bmo' ? '#3d9aff15' : '#ff8c3d15',
                          border: `1px solid ${event.hour === 'bmo' ? '#3d9aff40' : '#ff8c3d40'}`,
                          padding: '2px 8px',
                          borderRadius: 20,
                        }}
                      >
                        {event.hour === 'bmo'
                          ? 'PRE-MARKET'
                          : event.hour === 'amc'
                            ? 'AFTER-CLOSE'
                            : 'TBD'}
                      </span>
                      {event.epsEstimate !== null && event.epsEstimate !== undefined && (
                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>
                          EPS EST:{' '}
                          <span style={{ color: '#e8edf5' }}>${event.epsEstimate?.toFixed(2)}</span>
                        </span>
                      )}
                      {event.epsActual !== null && event.epsActual !== undefined && (
                        <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
                          ACTUAL:{' '}
                          <span
                            style={{
                              color:
                                (event.epsActual || 0) >= (event.epsEstimate || 0)
                                  ? '#00ff88'
                                  : '#ff3d5a',
                              fontWeight: 700,
                            }}
                          >
                            ${event.epsActual?.toFixed(2)}
                          </span>
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                        Q{event.quarter} {event.year}
                      </span>
                      <button
                        type="button"
                        onClick={() => buildEarningsThesis(event.symbol)}
                        disabled={isBuilding}
                        style={{
                          padding: '6px 12px',
                          background: isBuilding ? '#1e2a3a' : thesis ? '#00ff8815' : '#3d9aff15',
                          border: `1px solid ${isBuilding ? '#1e2a3a' : thesis ? '#00ff8840' : '#3d9aff40'}`,
                          borderRadius: 8,
                          color: isBuilding ? '#7a8fa8' : thesis ? '#00ff88' : '#3d9aff',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: isBuilding ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isBuilding ? 'ANALYZING...' : thesis ? '✓ THESIS READY' : '⚡ PRE-EARNINGS THESIS'}
                      </button>
                    </div>

                    {thesis && (
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid #1e2a3a' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 10,
                            marginTop: 12,
                            marginBottom: 10,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 9,
                              letterSpacing: 1,
                              fontWeight: 700,
                              color: directionColor(thesis.overall_direction),
                              background: `${directionColor(thesis.overall_direction)}15`,
                              border: `1px solid ${directionColor(thesis.overall_direction)}40`,
                              padding: '2px 10px',
                              borderRadius: 20,
                            }}
                          >
                            {thesis.overall_direction.toUpperCase()}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>
                            Conviction{' '}
                            <span style={{ color: '#e8edf5' }}>{thesis.conviction_score}/10</span>
                          </span>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: '#3d9aff',
                              fontWeight: 700,
                            }}
                          >
                            {thesis.options_setup.recommended_play}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: '#7a8fa8',
                            lineHeight: 1.6,
                            marginBottom: 8,
                          }}
                        >
                          {thesis.dark_recon_verdict}
                        </div>
                        <div style={{ fontSize: 12, color: '#3d5068' }}>
                          Target: {thesis.bull_case.price_target} · Downside:{' '}
                          {thesis.bear_case.downside_target} · {thesis.options_setup.expiration}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
