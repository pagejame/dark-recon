'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';

interface CongressionalTrade {
  representative: string;
  ticker: string;
  transaction_date: string;
  disclosure_date: string;
  type: string;
  amount: string;
  asset_description: string;
  chamber: 'house' | 'senate';
}

interface TopTicker {
  ticker: string;
  count: number;
  buys: number;
  sells: number;
}

interface SmartMoneyAnalysis {
  sector_rotation: string;
  notable_signals: string;
  top_conviction_picks: string[];
  actionable_takeaways: string[];
  risk_note: string;
}

type TradeFilter = 'all' | 'purchases' | 'sales';

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

function daysSince(dateStr: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SectionCard({
  label,
  borderColor,
  children,
}: {
  label: string;
  borderColor: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 3,
          color: borderColor,
          marginBottom: 16,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function isPurchase(type: string) {
  return type === 'Purchase';
}

function isSale(type: string) {
  return type.includes('Sale');
}

export default function SmartMoneyPage() {
  const [recentTrades, setRecentTrades] = useState<CongressionalTrade[]>([]);
  const [topTickers, setTopTickers] = useState<TopTicker[]>([]);
  const [notableActivity, setNotableActivity] = useState<CongressionalTrade[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<TradeFilter>('all');
  const [search, setSearch] = useState('');
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<SmartMoneyAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/smartmoney');
      const data = await res.json();
      if (data.error && !data.recent_trades?.length) {
        throw new Error(data.error);
      }
      setRecentTrades(data.recent_trades || []);
      setTopTickers(data.top_tickers || []);
      setNotableActivity(data.notable_activity || []);
      setUpdatedAt(data.updated_at || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load smart money data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const runAnalysis = async () => {
    if (analysis) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/smartmoney/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notable: notableActivity,
          top_tickers: topTickers,
          trades: recentTrades,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredTrades = useMemo(() => {
    return recentTrades.filter((t) => {
      if (tickerFilter && t.ticker !== tickerFilter) return false;
      if (filter === 'purchases' && !isPurchase(t.type)) return false;
      if (filter === 'sales' && !isSale(t.type)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.ticker.toLowerCase().includes(q) ||
          t.representative.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [recentTrades, filter, search, tickerFilter]);

  const maxTickerCount = Math.max(...topTickers.map((t) => t.count), 1);

  return (
    <div className="mx-auto max-w-[1100px] px-3.5 py-6 md:p-6">
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
          Smart Money
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Congressional trades & institutional activity — follow the informed
        </div>
        <div style={{ fontSize: 11, color: '#3d5068', fontFamily: 'monospace', marginTop: 4 }}>
          STOCK ACT disclosures — data from Finnhub + Capitol Trades. When live data unavailable, recent historical trades shown.
        </div>
        {updatedAt && (
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#3d5068',
              marginTop: 6,
            }}
          >
            Last updated {timeAgo(updatedAt)}
          </div>
        )}
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

      {/* Notable Activity */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard label="NOTABLE CONGRESSIONAL ACTIVITY" borderColor="#ffd700">
          {loading ? (
            <Skeleton height={100} />
          ) : notableActivity.length === 0 ? (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8', textAlign: 'center', padding: 24 }}>
              No notable activity in last 90 days
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {notableActivity.map((trade, i) => {
                const days = daysSince(trade.disclosure_date || trade.transaction_date);
                const urgent = days != null && days < 10;
                const purchase = isPurchase(trade.type);
                return (
                  <div
                    key={i}
                    style={{
                      background: '#0d1117',
                      border: `1px solid ${urgent ? '#ffd70040' : '#1e2a3a'}`,
                      borderRadius: 8,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5' }}>
                        {trade.representative}
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 1,
                          color: trade.chamber === 'house' ? '#3d9aff' : '#ff3d5a',
                          background: trade.chamber === 'house' ? '#3d9aff15' : '#ff3d5a15',
                          border: `1px solid ${trade.chamber === 'house' ? '#3d9aff40' : '#ff3d5a40'}`,
                          padding: '2px 8px',
                          borderRadius: 20,
                        }}
                      >
                        {trade.chamber.toUpperCase()}
                      </span>
                      {urgent && (
                        <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#ffd700' }}>
                          NEW
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <Link
                        href={`/thesis?ticker=${trade.ticker}`}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 20,
                          fontWeight: 700,
                          color: '#ffd700',
                          textDecoration: 'none',
                        }}
                      >
                        {trade.ticker}
                      </Link>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 1,
                          color: purchase ? '#00ff88' : '#ff3d5a',
                          background: purchase ? '#00ff8815' : '#ff3d5a15',
                          border: `1px solid ${purchase ? '#00ff8840' : '#ff3d5a40'}`,
                          padding: '2px 8px',
                          borderRadius: 20,
                        }}
                      >
                        {purchase ? 'PURCHASE' : 'SALE'}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>
                      {trade.amount}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', marginTop: 4 }}>
                      {trade.transaction_date}
                      {days != null && ` · disclosed ${days}d ago`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Two Column */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard label="RECENT TRADES (last 90 days)" borderColor="#3d9aff">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {(['all', 'purchases', 'sales'] as TradeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 1,
                    color: filter === f ? '#3d9aff' : '#7a8fa8',
                    background: filter === f ? '#3d9aff15' : '#0d1117',
                    border: `1px solid ${filter === f ? '#3d9aff40' : '#1e2a3a'}`,
                    padding: '6px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
              {tickerFilter && (
                <button
                  onClick={() => setTickerFilter(null)}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: '#ffd700',
                    background: '#ffd70015',
                    border: '1px solid #ffd70040',
                    padding: '6px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {tickerFilter} ✕
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Search ticker or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#e8edf5',
                background: '#0d1117',
                border: '1px solid #1e2a3a',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 12,
                outline: 'none',
              }}
            />
            {loading ? (
              <Skeleton height={200} />
            ) : (
              <div style={{ maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredTrades.length === 0 ? (
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068', padding: 16, textAlign: 'center' }}>
                    No trades match filter
                  </div>
                ) : (
                  filteredTrades.map((trade, i) => {
                    const purchase = isPurchase(trade.type);
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          background: '#0d1117',
                          borderRadius: 6,
                          border: '1px solid #1e2a3a20',
                        }}
                      >
                        <span style={{ fontSize: 11, color: '#e8edf5', minWidth: 100, flex: 1 }}>
                          {trade.representative.split(' ').slice(-1)[0]}
                        </span>
                        <Link
                          href={`/thesis?ticker=${trade.ticker}`}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#ffd700',
                            textDecoration: 'none',
                          }}
                        >
                          {trade.ticker}
                        </Link>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 8,
                            color: purchase ? '#00ff88' : '#ff3d5a',
                          }}
                        >
                          {purchase ? 'BUY' : 'SELL'}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                          {trade.amount}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                          {trade.transaction_date}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard label="CONGRESS FAVORITES (90 days)" borderColor="#ffd700">
            {loading ? (
              <Skeleton height={200} />
            ) : topTickers.length === 0 ? (
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068' }}>No data</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topTickers.map((item) => {
                  const total = item.buys + item.sells || 1;
                  const buyPct = (item.buys / total) * 100;
                  return (
                    <button
                      key={item.ticker}
                      onClick={() => setTickerFilter(item.ticker)}
                      style={{
                        background: tickerFilter === item.ticker ? '#ffd70010' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        padding: 0,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                          fontFamily: 'monospace',
                          fontSize: 11,
                        }}
                      >
                        <span style={{ color: '#ffd700', fontWeight: 700 }}>{item.ticker}</span>
                        <span style={{ color: '#7a8fa8' }}>
                          {item.count} ({item.buys}B / {item.sells}S)
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: '#1e2a3a',
                          borderRadius: 3,
                          overflow: 'hidden',
                          display: 'flex',
                        }}
                      >
                        <div
                          style={{
                            width: `${(item.count / maxTickerCount) * 100 * (buyPct / 100)}%`,
                            minWidth: item.buys > 0 ? 4 : 0,
                            background: '#00ff88',
                          }}
                        />
                        <div style={{ flex: 1, background: '#ff3d5a40' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* AI Analysis */}
      <SectionCard label="SMART MONEY ANALYSIS" borderColor="#00ff88">
        {!analysis && !analyzing && (
          <button
            onClick={() => runAnalysis()}
            disabled={loading || notableActivity.length === 0}
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              color: '#00ff88',
              background: '#00ff8815',
              border: '1px solid #00ff8840',
              padding: '10px 20px',
              borderRadius: 6,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            ANALYZE
          </button>
        )}
        {analyzing && (
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
            Analyzing congressional trading patterns…
          </div>
        )}
        {analysisError && (
          <div style={{ color: '#ff8fa0', fontSize: 13, marginTop: 8 }}>{analysisError}</div>
        )}
        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#00ff88', marginBottom: 6 }}>
                SECTOR ROTATION
              </div>
              <p style={{ fontSize: 13, color: '#7a8fa8', lineHeight: 1.6, margin: 0 }}>
                {analysis.sector_rotation}
              </p>
            </div>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d9aff', marginBottom: 6 }}>
                NOTABLE SIGNALS
              </div>
              <p style={{ fontSize: 13, color: '#7a8fa8', lineHeight: 1.6, margin: 0 }}>
                {analysis.notable_signals}
              </p>
            </div>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#ffd700', marginBottom: 8 }}>
                TOP CONVICTION PICKS
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#e8edf5', fontSize: 13, lineHeight: 1.8 }}>
                {analysis.top_conviction_picks.map((pick, i) => (
                  <li key={i}>{pick}</li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#00ff88', marginBottom: 8 }}>
                ACTIONABLE TAKEAWAYS
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#7a8fa8', fontSize: 13, lineHeight: 1.8 }}>
                {analysis.actionable_takeaways.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#3d5068',
                fontStyle: 'italic',
                borderTop: '1px solid #1e2a3a',
                paddingTop: 12,
              }}
            >
              {analysis.risk_note}
            </div>
          </div>
        )}
      </SectionCard>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
