'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';

interface SignalOutcome {
  id: string;
  ticker: string;
  signal_type: string | null;
  signal_strength: string | null;
  signal_date: string;
  action_taken: string | null;
  entry_price: number | null;
  price_at_signal: number | null;
  outcome_1d: number | null;
  outcome_5d: number | null;
  outcome_10d: number | null;
  result: 'win' | 'loss' | 'neutral' | 'pending' | null;
}

interface ScoreboardStats {
  total: number;
  win_rate: number;
  avg_gain: number;
  avg_loss: number;
}

interface TypePerformance {
  wins: number;
  losses: number;
  total: number;
  avg_return: number;
}

interface SignalInsights {
  best_signal_type?: string;
  worst_signal_type?: string;
  avg_win_return?: number;
  avg_loss_return?: number;
  win_rate?: number;
  insight?: string;
  recommendation?: string;
  updated_at?: string;
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  momentum_breakout: 'Momentum Breakout',
  unusual_volume: 'Unusual Volume',
  unusual_options: 'Unusual Options',
  reversal_candidate: 'Reversal',
  sector_leader: 'Sector Leader',
  insider_activity: 'Insider Activity',
  squeeze_candidate: 'Squeeze Setup',
  earnings_catalyst: 'Earnings Catalyst',
};

const RESULT_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  win: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
  loss: { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' },
  neutral: { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' },
  pending: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
};

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

function formatPct(val: number | null | undefined) {
  if (val == null) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export default function ScoreboardPage() {
  const [outcomes, setOutcomes] = useState<SignalOutcome[]>([]);
  const [stats, setStats] = useState<ScoreboardStats>({
    total: 0,
    win_rate: 0,
    avg_gain: 0,
    avg_loss: 0,
  });
  const [byType, setByType] = useState<Record<string, TypePerformance>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signalInsights, setSignalInsights] = useState<SignalInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const [ticker, setTicker] = useState('');
  const [signalType, setSignalType] = useState('momentum_breakout');
  const [signalDate, setSignalDate] = useState(new Date().toISOString().split('T')[0]);
  const [actionTaken, setActionTaken] = useState<'executed' | 'confirmed' | 'passed' | 'ignored'>(
    'confirmed'
  );
  const [entryPrice, setEntryPrice] = useState('');
  const [priceAtSignal, setPriceAtSignal] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoreRes, settingsRes] = await Promise.all([
        fetch('/api/scoreboard'),
        fetch('/api/settings'),
      ]);
      const data = await scoreRes.json();
      setOutcomes(data.outcomes || []);
      setStats(data.stats || { total: 0, win_rate: 0, avg_gain: 0, avg_loss: 0 });
      setByType(data.by_type || {});

      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setSignalInsights((settings.signal_insights as SignalInsights) || null);
      }
    } catch {
      setOutcomes([]);
    } finally {
      setLoading(false);
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!ticker.trim()) {
      setFormError('Ticker required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/scoreboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim(),
          signal_type: signalType,
          signal_date: new Date(signalDate).toISOString(),
          action_taken: actionTaken,
          entry_price: entryPrice ? parseFloat(entryPrice) : null,
          price_at_signal: priceAtSignal ? parseFloat(priceAtSignal) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setFormOpen(false);
      setTicker('');
      setEntryPrice('');
      setPriceAtSignal('');
      void fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const typeEntries = Object.entries(byType).sort((a, b) => b[1].total - a[1].total);

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
          Signal Scoreboard
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Track every signal — what you did, what happened after
        </div>
      </div>

      {/* Signal Intelligence */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard label="SIGNAL INTELLIGENCE — AUTO-UPDATED NIGHTLY" borderColor="#00ff88">
          {insightsLoading ? (
            <Skeleton height={80} />
          ) : signalInsights ? (
              <div>
                <div
                  className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4"
                  style={{ marginBottom: 16 }}
                >
                  {[
                    {
                      label: 'BEST TYPE',
                      value:
                        SIGNAL_TYPE_LABELS[signalInsights.best_signal_type || ''] ||
                        signalInsights.best_signal_type ||
                        '—',
                      color: '#00ff88',
                    },
                    {
                      label: 'WIN RATE',
                      value:
                        signalInsights.win_rate != null ? `${signalInsights.win_rate}%` : '—',
                      color: '#ffd700',
                    },
                    {
                      label: 'AVG WIN',
                      value:
                        signalInsights.avg_win_return != null
                          ? `+${signalInsights.avg_win_return.toFixed(1)}%`
                          : '—',
                      color: '#00ff88',
                    },
                    {
                      label: 'WORST TYPE',
                      value:
                        SIGNAL_TYPE_LABELS[signalInsights.worst_signal_type || ''] ||
                        signalInsights.worst_signal_type ||
                        '—',
                      color: '#ff3d5a',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        background: '#0d1117',
                        border: '1px solid #1e2a3a',
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 2,
                          color: '#7a8fa8',
                          marginBottom: 6,
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 13,
                          fontWeight: 700,
                          color: item.color,
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
                {signalInsights.insight && (
                  <p style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.6, margin: '0 0 8px' }}>
                    {signalInsights.insight}
                  </p>
                )}
                {signalInsights.recommendation && (
                  <p style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.6, margin: 0 }}>
                    → {signalInsights.recommendation}
                  </p>
                )}
                {signalInsights.updated_at && (
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      color: '#3d5068',
                      marginTop: 10,
                      letterSpacing: 1,
                    }}
                  >
                    Updated {new Date(signalInsights.updated_at).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8', margin: 0 }}>
                Insights generate after 5+ tracked signal outcomes — runs nightly at 5PM ET
              </p>
            )}
        </SectionCard>
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'SIGNALS TRACKED', value: String(stats.total), color: '#3d9aff' },
          { label: 'WIN RATE', value: `${stats.win_rate}%`, color: '#00ff88' },
          {
            label: 'AVG GAIN',
            value: formatPct(stats.avg_gain),
            color: '#00ff88',
          },
          {
            label: 'AVG LOSS',
            value: formatPct(stats.avg_loss),
            color: '#ff3d5a',
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderTop: `2px solid ${card.color}`,
              borderRadius: 10,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 8,
              }}
            >
              {card.label}
            </div>
            {loading ? (
              <Skeleton height={28} />
            ) : (
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 24,
                  fontWeight: 700,
                  color: card.color,
                }}
              >
                {card.value}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Outcome Form */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard label="LOG SIGNAL OUTCOME" borderColor="#ffd700">
          {!formOpen ? (
            <button
              onClick={() => setFormOpen(true)}
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                color: '#ffd700',
                background: '#ffd70015',
                border: '1px solid #ffd70040',
                padding: '10px 20px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              ADD OUTCOME
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                    TICKER
                  </label>
                  <input
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="NVDA"
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 6,
                      color: '#e8edf5',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                    SIGNAL TYPE
                  </label>
                  <select
                    value={signalType}
                    onChange={(e) => setSignalType(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 6,
                      color: '#e8edf5',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    {Object.entries(SIGNAL_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                    SIGNAL DATE
                  </label>
                  <input
                    type="date"
                    value={signalDate}
                    onChange={(e) => setSignalDate(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 6,
                      color: '#e8edf5',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                    ACTION TAKEN
                  </label>
                  <select
                    value={actionTaken}
                    onChange={(e) =>
                      setActionTaken(
                        e.target.value as 'executed' | 'confirmed' | 'passed' | 'ignored'
                      )
                    }
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 6,
                      color: '#e8edf5',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="executed">Executed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="passed">Passed</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                    ENTRY PRICE (if executed)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 6,
                      color: '#e8edf5',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                    PRICE AT SIGNAL
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={priceAtSignal}
                    onChange={(e) => setPriceAtSignal(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 6,
                      color: '#e8edf5',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {formError && (
                <div style={{ color: '#ff8fa0', fontSize: 13 }}>{formError}</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setFormOpen(false)}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    letterSpacing: 1,
                    color: '#7a8fa8',
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    padding: '8px 16px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    letterSpacing: 2,
                    color: '#080a0f',
                    background: saving ? '#1e2a3a' : '#ffd700',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: 6,
                    cursor: saving ? 'wait' : 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {saving ? 'SAVING…' : 'SAVE'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Outcomes Table */}
        <div className="lg:col-span-2">
          <SectionCard label="SIGNAL OUTCOMES" borderColor="#3d9aff">
            {loading ? (
              <Skeleton height={200} />
            ) : outcomes.length === 0 ? (
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#7a8fa8',
                  textAlign: 'center',
                  padding: 32,
                  lineHeight: 1.6,
                }}
              >
                No signals tracked yet — confirm or pass signals from the Signals page to start
                building your scoreboard
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e2a3a' }}>
                      {[
                        'Ticker',
                        'Type',
                        'Strength',
                        'Action',
                        'At Signal',
                        '1D',
                        '5D',
                        '10D',
                        'Result',
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 8,
                            letterSpacing: 1,
                            color: '#3d5068',
                            textAlign: 'left',
                            padding: '8px 6px',
                            fontWeight: 400,
                          }}
                        >
                          {h.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.map((o) => {
                      const resultKey = o.result || 'pending';
                      const rs = RESULT_STYLES[resultKey] || RESULT_STYLES.pending;
                      return (
                        <tr key={o.id} style={{ borderBottom: '1px solid #1e2a3a20' }}>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: '#ffd700',
                              padding: '10px 6px',
                            }}
                          >
                            {o.ticker}
                          </td>
                          <td style={{ color: '#7a8fa8', padding: '10px 6px', fontSize: 11 }}>
                            {SIGNAL_TYPE_LABELS[o.signal_type || ''] || o.signal_type || '—'}
                          </td>
                          <td style={{ color: '#7a8fa8', padding: '10px 6px', fontSize: 11 }}>
                            {o.signal_strength?.toUpperCase() || '—'}
                          </td>
                          <td style={{ color: '#e8edf5', padding: '10px 6px', fontSize: 11 }}>
                            {o.action_taken?.toUpperCase() || '—'}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              color: '#7a8fa8',
                              padding: '10px 6px',
                              fontSize: 11,
                            }}
                          >
                            {o.price_at_signal != null ? `$${o.price_at_signal}` : '—'}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              color: (o.outcome_1d || 0) >= 0 ? '#00ff88' : '#ff3d5a',
                              padding: '10px 6px',
                              fontSize: 11,
                            }}
                          >
                            {formatPct(o.outcome_1d)}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              color: (o.outcome_5d || 0) >= 0 ? '#00ff88' : '#ff3d5a',
                              padding: '10px 6px',
                              fontSize: 11,
                            }}
                          >
                            {formatPct(o.outcome_5d)}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              color: (o.outcome_10d || 0) >= 0 ? '#00ff88' : '#ff3d5a',
                              padding: '10px 6px',
                              fontSize: 11,
                            }}
                          >
                            {formatPct(o.outcome_10d)}
                          </td>
                          <td style={{ padding: '10px 6px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontSize: 8,
                                letterSpacing: 1,
                                color: rs.color,
                                background: rs.bg,
                                border: `1px solid ${rs.border}`,
                                padding: '2px 8px',
                                borderRadius: 20,
                              }}
                            >
                              {(o.result || 'pending').toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Performance by Type */}
        <div>
          <SectionCard label="PERFORMANCE BY SIGNAL TYPE" borderColor="#00ff88">
            {loading ? (
              <Skeleton height={160} />
            ) : typeEntries.length === 0 ? (
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068' }}>
                No executed signals yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {typeEntries.map(([type, perf]) => {
                  const winRate =
                    perf.total > 0 ? Math.round((perf.wins / perf.total) * 100) : 0;
                  return (
                    <div
                      key={type}
                      style={{
                        background: '#0d1117',
                        border: '1px solid #1e2a3a',
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 10,
                          color: '#e8edf5',
                          marginBottom: 6,
                        }}
                      >
                        {SIGNAL_TYPE_LABELS[type] || type}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontFamily: 'monospace',
                          fontSize: 10,
                          color: '#7a8fa8',
                        }}
                      >
                        <span>{winRate}% win rate</span>
                        <span>{formatPct(perf.avg_return)} avg</span>
                        <span>{perf.total} trades</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
