'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

interface IntelligenceSignal {
  source: string;
  signal_type: string;
  ticker?: string;
  headline: string;
  summary: string;
  url?: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  strength: 'high' | 'medium' | 'low';
  swept_at: string;
}

type StrengthFilter = 'all' | 'high' | 'medium' | 'low';
type SourceFilter = 'all' | 'reddit' | 'sec' | 'news';

function Skeleton({ height = 20 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        background: 'linear-gradient(90deg, #1e2a3a 25%, #2a3a4a 50%, #1e2a3a 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: 6,
      }}
    />
  );
}

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sourceBadgeStyle(source: string) {
  const s = source.toLowerCase();
  if (s.includes('reddit')) return { color: '#ff8c3d', bg: '#ff8c3d15', border: '#ff8c3d40' };
  if (s.includes('sec')) return { color: '#3d9aff', bg: '#3d9aff15', border: '#3d9aff40' };
  if (s.includes('financial news')) return { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' };
  return { color: '#00d4aa', bg: '#00d4aa15', border: '#00d4aa40' };
}

function sentimentStyle(s: string) {
  if (s === 'bullish') return { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' };
  if (s === 'bearish') return { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' };
  return { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' };
}

function strengthColor(strength: string) {
  if (strength === 'high') return '#00ff88';
  if (strength === 'medium') return '#ffd700';
  return '#7a8fa8';
}

function matchesSourceFilter(source: string, filter: SourceFilter) {
  const s = source.toLowerCase();
  if (filter === 'reddit') return s.includes('reddit');
  if (filter === 'sec') return s.includes('sec');
  if (filter === 'news') return s.includes('news') || s.includes('financial');
  return true;
}

export default function IntelligencePage() {
  const [signals, setSignals] = useState<IntelligenceSignal[]>([]);
  const [sweptAt, setSweptAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strengthFilter, setStrengthFilter] = useState<StrengthFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [tickerSearch, setTickerSearch] = useState('');

  const fetchSignals = useCallback(async (refresh = false) => {
    if (refresh) setSweeping(true);
    else setLoading(true);
    setError(null);
    try {
      const url = refresh ? '/api/intelligence?refresh=true' : '/api/intelligence';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok && !data.signals?.length) {
        throw new Error(data.error || 'Sweep failed');
      }
      setSignals(data.signals || []);
      setSweptAt(data.swept_at || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load intelligence');
      setSignals([]);
    } finally {
      setLoading(false);
      setSweeping(false);
    }
  }, []);

  useEffect(() => {
    void fetchSignals();
  }, [fetchSignals]);

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (strengthFilter !== 'all' && s.strength !== strengthFilter) return false;
      if (!matchesSourceFilter(s.source, sourceFilter)) return false;
      if (tickerSearch.trim()) {
        const q = tickerSearch.toUpperCase();
        const inTicker = s.ticker?.toUpperCase().includes(q);
        const inHeadline = s.headline.toUpperCase().includes(q);
        if (!inTicker && !inHeadline) return false;
      }
      return true;
    });
  }, [signals, strengthFilter, sourceFilter, tickerSearch]);

  return (
    <div className="mx-auto max-w-[900px] px-3.5 py-6 md:p-6">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
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
            Intelligence Feed
          </h1>
          <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
            Real-time sweep — Reddit, SEC, news, and market signals before they&apos;re priced in
          </div>
          {sweptAt && !sweeping && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#3d5068',
                marginTop: 6,
              }}
            >
              Last swept {timeAgo(sweptAt)}
            </div>
          )}
          {sweeping && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#00ff88',
                marginTop: 6,
              }}
            >
              Sweeping…
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {signals.length > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#3d9aff',
                background: '#3d9aff15',
                border: '1px solid #3d9aff40',
                padding: '4px 12px',
                borderRadius: 20,
              }}
            >
              {signals.length} SIGNALS
            </span>
          )}
          <button
            onClick={() => fetchSignals(true)}
            disabled={sweeping}
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              color: '#00ff88',
              background: '#00ff8815',
              border: '1px solid #00ff8840',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: sweeping ? 'wait' : 'pointer',
              opacity: sweeping ? 0.6 : 1,
            }}
          >
            {sweeping ? 'SWEEPING…' : 'SWEEP NOW'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {(['all', 'high', 'medium', 'low'] as StrengthFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStrengthFilter(f)}
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                color: strengthFilter === f ? strengthColor(f === 'all' ? 'high' : f) : '#7a8fa8',
                background: strengthFilter === f ? '#1e2a3a' : '#0d1117',
                border: `1px solid ${strengthFilter === f ? '#3d5068' : '#1e2a3a'}`,
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {(['all', 'reddit', 'sec', 'news'] as SourceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                color: sourceFilter === f ? '#e8edf5' : '#7a8fa8',
                background: sourceFilter === f ? '#1e2a3a' : '#0d1117',
                border: `1px solid ${sourceFilter === f ? '#3d5068' : '#1e2a3a'}`,
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search ticker..."
          value={tickerSearch}
          onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
          style={{
            width: '100%',
            maxWidth: 240,
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#ffd700',
            background: '#0d1117',
            border: '1px solid #1e2a3a',
            borderRadius: 6,
            padding: '8px 12px',
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <div
          style={{
            background: '#ff3d5a10',
            border: '1px solid #ff3d5a40',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            color: '#ff8fa0',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={100} />
          ))}
        </div>
      ) : filteredSignals.length === 0 ? (
        <div
          style={{
            background: '#111620',
            border: '1px solid #1e2a3a',
            borderRadius: 10,
            padding: 48,
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#7a8fa8',
            lineHeight: 1.6,
          }}
        >
          No signals found — hit SWEEP NOW to scan the internet for pre-priced intelligence
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredSignals.map((signal, i) => {
            const badge = sourceBadgeStyle(signal.source);
            const sent = sentimentStyle(signal.sentiment);
            const isHigh = signal.strength === 'high';
            return (
              <div
                key={i}
                style={{
                  background: '#111620',
                  border: '1px solid #1e2a3a',
                  borderLeft: isHigh ? '3px solid #00ff88' : '3px solid #1e2a3a',
                  borderRadius: 10,
                  padding: '16px 20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: badge.color,
                      background: badge.bg,
                      border: `1px solid ${badge.border}`,
                      padding: '2px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {signal.source.split(' ')[0].toUpperCase()}
                  </span>
                  {signal.ticker && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#ffd700',
                      }}
                    >
                      {signal.ticker}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: sent.color,
                      background: sent.bg,
                      border: `1px solid ${sent.border}`,
                      padding: '2px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {signal.sentiment.toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      color: strengthColor(signal.strength),
                    }}
                  >
                    ● {signal.strength.toUpperCase()}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontFamily: 'monospace',
                      fontSize: 9,
                      color: '#3d5068',
                    }}
                  >
                    {timeAgo(signal.swept_at)}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#e8edf5',
                    margin: '0 0 8px',
                    lineHeight: 1.4,
                  }}
                >
                  {signal.headline}
                </h3>
                <p style={{ fontSize: 13, color: '#7a8fa8', margin: '0 0 12px', lineHeight: 1.5 }}>
                  {signal.summary}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {signal.url && (
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color: '#3d5068',
                        textDecoration: 'none',
                      }}
                    >
                      View Source →
                    </a>
                  )}
                  {signal.ticker && (
                    <Link
                      href={`/thesis?ticker=${signal.ticker}`}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 9,
                        letterSpacing: 1,
                        color: '#3d9aff',
                        background: '#3d9aff15',
                        border: '1px solid #3d9aff40',
                        padding: '4px 12px',
                        borderRadius: 6,
                        textDecoration: 'none',
                      }}
                    >
                      BUILD THESIS →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
