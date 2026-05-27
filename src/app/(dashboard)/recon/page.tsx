'use client';

import { useState, useEffect } from 'react';
import type { ThesisResult } from '@/lib/agents/thesis';

interface WatchlistItem {
  id: string;
  ticker: string;
  notes: string | null;
  added_at: string;
}

interface TickerIntel {
  ticker: string;
  loading: boolean;
  error: string | null;
  thesis: ThesisResult | null;
}

export default function ReconFeedPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [adding, setAdding] = useState(false);
  const [intel, setIntel] = useState<Record<string, TickerIntel>>({});
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      setWatchlist(data.watchlist || []);
    } catch {
      // silent fail
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const addTicker = async () => {
    const t = newTicker.trim().toUpperCase();
    if (!t || t.length > 5) return;
    setAdding(true);
    try {
      await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t }),
      });
      setNewTicker('');
      await fetchWatchlist();
    } catch {
      // silent fail
    } finally {
      setAdding(false);
    }
  };

  const removeTicker = async (ticker: string) => {
    try {
      await fetch(`/api/watchlist/${ticker}`, { method: 'DELETE' });
      setWatchlist((prev) => prev.filter((w) => w.ticker !== ticker));
      setIntel((prev) => {
        const next = { ...prev };
        delete next[ticker];
        return next;
      });
    } catch {
      // silent fail
    }
  };

  const analyzeTicke = async (ticker: string) => {
    setIntel((prev) => ({
      ...prev,
      [ticker]: { ticker, loading: true, error: null, thesis: null },
    }));
    try {
      const res = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setIntel((prev) => ({
        ...prev,
        [ticker]: { ticker, loading: false, error: null, thesis: data },
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Analysis failed';
      setIntel((prev) => ({
        ...prev,
        [ticker]: { ticker, loading: false, error: message, thesis: null },
      }));
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  useEffect(() => {
    const onPullRefresh = () => fetchWatchlist();
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, []);

  const directionColor = (d: string) =>
    d === 'bullish' ? '#00ff88' : d === 'bearish' ? '#ff3d5a' : '#ffd700';

  return (
    <div className="dr-page dr-page-narrow">
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
          Recon Feed
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          {watchlist.length} tickers under surveillance
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-2.5 rounded-[10px] border border-border bg-bg-card p-3.5 md:flex-row md:gap-2.5 md:p-5">
        <input
          type="text"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && addTicker()}
          placeholder="Add ticker to watchlist..."
          maxLength={5}
          className="w-full rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5 font-mono text-base tracking-wide text-text-primary outline-none md:flex-1 md:text-sm"
        />
        <button
          onClick={addTicker}
          disabled={adding || !newTicker.trim()}
          className="w-full rounded-lg border-none px-5 py-2.5 font-mono text-[10px] font-bold tracking-wider disabled:cursor-not-allowed md:w-auto"
          style={{
            background: adding || !newTicker.trim() ? '#1e2a3a' : '#00ff88',
            color: adding || !newTicker.trim() ? '#7a8fa8' : '#080a0f',
          }}
        >
          {adding ? 'ADDING...' : '+ ADD'}
        </button>
      </div>

      {loadingWatchlist ? (
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
          LOADING WATCHLIST...
        </div>
      ) : watchlist.length === 0 ? (
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
          NO TICKERS — ADD ONE ABOVE
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {watchlist.map((item) => {
            const tickerIntel = intel[item.ticker];
            const hasThesis = tickerIntel?.thesis;
            const isLoading = tickerIntel?.loading;
            const hasError = tickerIntel?.error;

            return (
              <div
                key={item.ticker}
                style={{
                  background: '#111620',
                  border: '1px solid #1e2a3a',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <div className="flex flex-wrap items-center gap-2 px-3.5 py-3.5 md:gap-3 md:px-4 md:py-3.5">
                  <span className="min-w-[70px] font-mono text-lg font-bold text-accent-yellow md:text-base">
                    {item.ticker}
                  </span>
                  {hasThesis && (
                    <>
                      <span
                        style={{
                          color: directionColor(hasThesis.overall_direction),
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 2,
                          fontWeight: 700,
                        }}
                      >
                        {hasThesis.overall_direction.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>
                        Conviction{' '}
                        <span style={{ color: '#e8edf5' }}>{hasThesis.conviction_score}/10</span>
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>
                        Target{' '}
                        <span style={{ color: '#00ff88' }}>{hasThesis.bull_case.price_target}</span>
                      </span>
                    </>
                  )}
                  <div className="hidden flex-1 md:block" />
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => analyzeTicke(item.ticker)}
                    disabled={isLoading}
                    style={{
                      padding: '6px 14px',
                      background: isLoading ? '#1e2a3a' : '#3d9aff15',
                      border: `1px solid ${isLoading ? '#1e2a3a' : '#3d9aff40'}`,
                      borderRadius: 8,
                      color: isLoading ? '#7a8fa8' : '#3d9aff',
                      fontFamily: 'monospace',
                      fontSize: 9,
                      letterSpacing: 1,
                      cursor: 'pointer',
                    }}
                  >
                    {isLoading ? 'ANALYZING...' : hasThesis ? '↻ REFRESH' : '⚡ ANALYZE'}
                  </button>
                  <button
                    onClick={() => removeTicker(item.ticker)}
                    style={{
                      padding: '6px 10px',
                      background: 'transparent',
                      border: '1px solid #1e2a3a',
                      borderRadius: 8,
                      color: '#3d5068',
                      fontFamily: 'monospace',
                      fontSize: 9,
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                  </div>
                </div>

                {hasError && (
                  <div
                    style={{
                      padding: '10px 16px',
                      borderTop: '1px solid #1e2a3a',
                      fontSize: 12,
                      color: '#ff8fa0',
                      background: '#ff3d5a08',
                    }}
                  >
                    {hasError}
                  </div>
                )}

                {hasThesis && (
                  <div className="border-t border-border px-3.5 pb-4 md:px-4 md:pb-4">
                    <div className="mt-3.5 mb-3 text-[13px] leading-[1.7] text-text-secondary">
                      <strong style={{ color: '#00ff88' }}>Bull:</strong> {hasThesis.bull_case.summary}
                    </div>
                    <div className="mb-3 text-[13px] leading-[1.7] text-text-secondary">
                      <strong style={{ color: '#ff3d5a' }}>Bear:</strong> {hasThesis.bear_case.summary}
                    </div>
                    <div
                      className="rounded-lg border border-border border-l-[3px] border-l-accent-yellow bg-bg-secondary p-2.5 text-[13px] leading-relaxed text-text-primary md:p-3"
                    >
                      {hasThesis.dark_recon_verdict}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#3d9aff',
                        fontWeight: 700,
                      }}
                    >
                      {hasThesis.options_setup.recommended_play}
                      <span style={{ color: '#7a8fa8', fontWeight: 400, marginLeft: 12 }}>
                        {hasThesis.options_setup.expiration} · Max loss:{' '}
                        {hasThesis.options_setup.max_loss}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
