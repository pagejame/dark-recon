'use client';

import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react';

interface AnalyticsSummary {
  total_trades: number;
  buy_count: number;
  sell_count: number;
  total_pnl: number;
  day_pnl: number;
  equity: number;
  win_rate: number;
  journal_count: number;
}

interface TradeHistoryItem {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  filled_price: number;
  filled_at: string;
  dollar_value: number;
}

interface JournalEntry {
  id: string;
  ticker: string;
  position_type: string | null;
  thesis: string | null;
  signal_source: string | null;
  entry_notes: string | null;
  exit_notes: string | null;
  result: 'win' | 'loss' | 'breakeven' | null;
  lessons: string | null;
  created_at: string;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  trade_history: TradeHistoryItem[];
  signal_performance: Record<string, { count: number; wins: number; losses: number }>;
  top_symbols: { symbol: string; count: number }[];
  journal_entries: JournalEntry[];
}

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

function formatMoney(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function StatCard({
  label,
  value,
  accent,
  valueColor,
}: {
  label: string;
  value: string;
  accent: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderTop: `2px solid ${accent}`,
        borderRadius: 10,
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 8,
          letterSpacing: 3,
          color: '#7a8fa8',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 28,
          fontWeight: 700,
          color: valueColor || '#e8edf5',
        }}
      >
        {value}
      </div>
    </div>
  );
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
        height: '100%',
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

const thStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 8,
  letterSpacing: 2,
  color: '#7a8fa8',
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid #1e2a3a',
};

const tdStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#e8edf5',
  padding: '12px',
  borderBottom: '1px solid #1e2a3a20',
};

function resultPill(result: string | null) {
  const styles: Record<string, { color: string; bg: string; border: string; label: string }> = {
    win: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840', label: 'WIN' },
    loss: { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40', label: 'LOSS' },
    breakeven: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040', label: 'BREAKEVEN' },
  };
  const s = result ? styles[result] : null;
  if (!s) {
    return (
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 8,
          letterSpacing: 1,
          color: '#7a8fa8',
          background: '#7a8fa815',
          border: '1px solid #7a8fa840',
          padding: '2px 8px',
          borderRadius: 20,
        }}
      >
        PENDING
      </span>
    );
  }
  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 8,
        letterSpacing: 1,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        padding: '2px 8px',
        borderRadius: 20,
      }}
    >
      {s.label}
    </span>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJournal, setExpandedJournal] = useState<string | null>(null);
  const [hoverTrade, setHoverTrade] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load analytics');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analytics unavailable');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    const onPullRefresh = () => fetchAnalytics();
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [fetchAnalytics]);

  const summary = data?.summary;
  const maxSymbolCount = Math.max(...(data?.top_symbols.map((s) => s.count) || [1]), 1);

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
          Trade Analytics
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Performance scoreboard — win rate, P&L, and signal source breakdown
        </div>
      </div>

      {/* Section 1 — Summary Stats */}
      {loading ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={80} />
          ))}
        </div>
      ) : error && !summary ? (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            background: '#ff3d5a10',
            border: '1px solid #ff3d5a40',
            borderRadius: 10,
            color: '#ff8fa0',
          }}
        >
          {error}
        </div>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="TOTAL TRADES" value={String(summary.total_trades)} accent="#3d9aff" />
          <StatCard
            label="TOTAL P&L"
            value={`${summary.total_pnl >= 0 ? '+' : ''}${formatMoney(summary.total_pnl)}`}
            accent={summary.total_pnl >= 0 ? '#00ff88' : '#ff3d5a'}
            valueColor={summary.total_pnl >= 0 ? '#00ff88' : '#ff3d5a'}
          />
          <StatCard
            label="WIN RATE"
            value={`${summary.win_rate}%`}
            accent="#ffd700"
            valueColor="#ffd700"
          />
          <StatCard
            label="PORTFOLIO VALUE"
            value={formatMoney(summary.equity)}
            accent="#00ff88"
          />
        </div>
      ) : null}

      {/* Section 2 — Two Column */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard label="TRADE HISTORY" borderColor="#3d9aff">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} height={32} />
                ))}
              </div>
            ) : !data?.trade_history?.length ? (
              <p
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  letterSpacing: 1,
                  color: '#7a8fa8',
                  textAlign: 'center',
                  padding: 32,
                }}
              >
                No trades yet — execute trades from Signals or Thesis Builder
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['SYMBOL', 'SIDE', 'QTY', 'PRICE', 'VALUE', 'TIME'].map((h) => (
                        <th key={h} style={thStyle}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.trade_history.slice(0, 20).map((trade) => (
                      <tr
                        key={trade.id}
                        onMouseEnter={() => setHoverTrade(trade.id)}
                        onMouseLeave={() => setHoverTrade(null)}
                        style={{
                          background: hoverTrade === trade.id ? '#1e2a3a40' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ ...tdStyle, color: '#ffd700', fontWeight: 700 }}>
                          {trade.symbol}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            color: trade.side === 'buy' ? '#00ff88' : '#ff3d5a',
                            fontWeight: 700,
                          }}
                        >
                          {trade.side.toUpperCase()}
                        </td>
                        <td style={tdStyle}>{trade.qty}</td>
                        <td style={tdStyle}>{formatMoney(trade.filled_price)}</td>
                        <td style={tdStyle}>{formatMoney(trade.dollar_value)}</td>
                        <td style={{ ...tdStyle, color: '#7a8fa8', fontSize: 10 }}>
                          {trade.filled_at
                            ? new Date(trade.filled_at).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <SectionCard label="MOST TRADED" borderColor="#ffd700">
            {loading ? (
              <Skeleton height={120} />
            ) : !data?.top_symbols?.length ? (
              <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>No trades yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.top_symbols.map((item) => (
                  <div key={item.symbol}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: '#ffd700', fontWeight: 700 }}>{item.symbol}</span>
                      <span style={{ color: '#7a8fa8' }}>{item.count}</span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: '#1e2a3a',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(item.count / maxSymbolCount) * 100}%`,
                          height: '100%',
                          background: '#ffd700',
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard label="BY SIGNAL SOURCE" borderColor="#00ff88">
            {loading ? (
              <Skeleton height={100} />
            ) : !data?.signal_performance ||
              Object.keys(data.signal_performance).length === 0 ? (
              <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8', lineHeight: 1.6 }}>
                Log trade results in Journal to see performance by signal source
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(data.signal_performance).map(([source, perf]) => {
                  const total = perf.wins + perf.losses || 1;
                  const winPct = (perf.wins / total) * 100;
                  return (
                    <div key={source}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontFamily: 'monospace',
                          fontSize: 10,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: '#e8edf5' }}>{source}</span>
                        <span style={{ color: '#7a8fa8' }}>
                          {perf.count} trades · {perf.wins}W / {perf.losses}L
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: '#ff3d5a30',
                          borderRadius: 3,
                          overflow: 'hidden',
                          display: 'flex',
                        }}
                      >
                        <div style={{ width: `${winPct}%`, background: '#00ff88' }} />
                        <div style={{ flex: 1, background: '#ff3d5a' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Section 3 — Journal Entries */}
      <SectionCard label="RECENT JOURNAL ENTRIES" borderColor="#ff8c3d">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={48} />
            ))}
          </div>
        ) : !data?.journal_entries?.length ? (
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              letterSpacing: 1,
              color: '#7a8fa8',
              textAlign: 'center',
              padding: 32,
            }}
          >
            Save trades to journal from the Trade Journal page
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.journal_entries.slice(0, 10).map((entry) => {
              const isExpanded = expandedJournal === entry.id;
              const thesisSnippet = entry.thesis
                ? entry.thesis.length > 100
                  ? `${entry.thesis.slice(0, 100)}…`
                  : entry.thesis
                : '—';

              return (
                <div
                  key={entry.id}
                  onClick={() => setExpandedJournal(isExpanded ? null : entry.id)}
                  style={{
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    borderRadius: 8,
                    padding: '12px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#ffd700',
                      }}
                    >
                      {entry.ticker}
                    </span>
                    {entry.position_type && (
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 1,
                          color: '#3d9aff',
                          background: '#3d9aff15',
                          border: '1px solid #3d9aff40',
                          padding: '2px 8px',
                          borderRadius: 20,
                        }}
                      >
                        {entry.position_type.toUpperCase()}
                      </span>
                    )}
                    {resultPill(entry.result)}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color: '#3d5068',
                      }}
                    >
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.5, margin: 0 }}>
                    {thesisSnippet}
                  </p>
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid #1e2a3a',
                        fontSize: 12,
                        color: '#7a8fa8',
                        lineHeight: 1.6,
                      }}
                    >
                      {entry.thesis && (
                        <p style={{ marginBottom: 8 }}>
                          <strong style={{ color: '#e8edf5' }}>Thesis:</strong> {entry.thesis}
                        </p>
                      )}
                      {entry.entry_notes && (
                        <p style={{ marginBottom: 8 }}>
                          <strong style={{ color: '#e8edf5' }}>Entry:</strong> {entry.entry_notes}
                        </p>
                      )}
                      {entry.exit_notes && (
                        <p style={{ marginBottom: 8 }}>
                          <strong style={{ color: '#e8edf5' }}>Exit:</strong> {entry.exit_notes}
                        </p>
                      )}
                      {entry.lessons && (
                        <p style={{ margin: 0 }}>
                          <strong style={{ color: '#e8edf5' }}>Lessons:</strong> {entry.lessons}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
