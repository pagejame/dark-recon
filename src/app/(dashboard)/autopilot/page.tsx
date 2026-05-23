'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Link from 'next/link';

interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  ticker?: string;
  rationale: string;
}

interface PositionReview {
  ticker: string;
  recommendation: 'hold' | 'add' | 'reduce' | 'close';
  rationale: string;
  current_pnl_pct?: number;
}

interface TopOpportunity {
  ticker: string;
  thesis: string;
  play: string;
  conviction: 'high' | 'medium' | 'low';
}

interface RiskFlag {
  flag: string;
  severity: 'high' | 'medium' | 'low';
}

interface AutopilotReport {
  date: string;
  market_sentiment: string;
  overall_action: 'aggressive' | 'moderate' | 'defensive' | 'hold';
  report_text: string;
  action_items: ActionItem[];
  positions_review: PositionReview[];
  top_opportunities: TopOpportunity[];
  risk_flags: RiskFlag[];
  generated_at: string;
  error?: string;
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

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
}

function overallActionStyle(action: AutopilotReport['overall_action']) {
  const styles = {
    aggressive: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
    moderate: { color: '#3d9aff', bg: '#3d9aff15', border: '#3d9aff40' },
    defensive: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
    hold: { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' },
  };
  return styles[action] || styles.hold;
}

function priorityStyle(priority: string) {
  if (priority === 'high') return { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' };
  if (priority === 'medium') return { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' };
  return { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' };
}

function recommendationStyle(rec: string) {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    hold: { color: '#3d9aff', bg: '#3d9aff15', border: '#3d9aff40' },
    add: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
    reduce: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
    close: { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' },
  };
  return map[rec] || map.hold;
}

function severityStyle(severity: string) {
  if (severity === 'high') return { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' };
  if (severity === 'medium') return { color: '#ff8c3d', bg: '#ff8c3d15', border: '#ff8c3d40' };
  return { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' };
}

function Pill({ label, style }: { label: string; style: { color: string; bg: string; border: string } }) {
  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 8,
        letterSpacing: 1,
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.border}`,
        padding: '3px 10px',
        borderRadius: 20,
      }}
    >
      {label}
    </span>
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

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function AutopilotPage() {
  const [report, setReport] = useState<AutopilotReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);

  const fetchReport = useCallback(async (refresh = false) => {
    if (refresh) setRunning(true);
    else setLoading(true);
    setError(null);
    setLoadingMsg(null);

    try {
      const url = refresh ? '/api/autopilot?refresh=true' : '/api/autopilot';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Autopilot failed');
      setReport(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Autopilot unavailable';
      setError(msg);
      setReport(null);
    } finally {
      setLoading(false);
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (!loading && !running) {
      setLoadingMsg(null);
      return;
    }
    const t3 = setTimeout(
      () => setLoadingMsg('Autopilot is analyzing your portfolio and market conditions...'),
      3000
    );
    const t8 = setTimeout(
      () => setLoadingMsg('Almost ready — building your action plan...'),
      8000
    );
    return () => {
      clearTimeout(t3);
      clearTimeout(t8);
    };
  }, [loading, running]);

  useEffect(() => {
    const onPullRefresh = () => fetchReport(true);
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [fetchReport]);

  const actionStyle = report ? overallActionStyle(report.overall_action) : null;
  const paragraphs = report?.report_text?.split('\n\n') || [];
  const sortedActions = [...(report?.action_items || [])].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  return (
    <div className="mx-auto max-w-[1100px] px-3.5 py-6 md:p-6">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 24,
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
            Autopilot
          </h1>
          <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
            Autonomous daily intelligence — updated every morning
          </div>
          {report?.generated_at && !loading && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#3d5068',
                marginTop: 6,
              }}
            >
              Generated {timeAgo(report.generated_at)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {actionStyle && report && (
            <Pill label={report.overall_action.toUpperCase()} style={actionStyle} />
          )}
          <button
            onClick={() => fetchReport(true)}
            disabled={running}
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              color: '#00ff88',
              background: '#00ff8815',
              border: '1px solid #00ff8840',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: running ? 'wait' : 'pointer',
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? 'RUNNING…' : 'RUN AUTOPILOT'}
          </button>
        </div>
      </div>

      {error && !loading && (
        <div
          style={{
            background: '#ff3d5a10',
            border: '1px solid #ff3d5a40',
            borderRadius: 10,
            padding: '20px 24px',
            marginBottom: 24,
          }}
        >
          <div style={{ color: '#ff8fa0', fontSize: 14, marginBottom: 12 }}>{error}</div>
          <button
            onClick={() => fetchReport(true)}
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              color: '#ff3d5a',
              background: '#ff3d5a15',
              border: '1px solid #ff3d5a40',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            RUN AUTOPILOT
          </button>
        </div>
      )}

      {(loading || running) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={120} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Skeleton height={160} />
              <Skeleton height={160} />
              <Skeleton height={160} />
            </div>
            <Skeleton height={80} />
          </div>
          {loadingMsg && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: '#7a8fa8',
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              {loadingMsg}
            </div>
          )}
        </div>
      )}

      {!loading && !running && report && (
        <>
          <SectionCard label="DAILY INTELLIGENCE REPORT" borderColor="#00ff88">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {paragraphs.map((para, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    fontSize: i === 0 ? 15 : 13,
                    color: i === 0 ? '#e8edf5' : '#7a8fa8',
                    lineHeight: 1.7,
                  }}
                >
                  {para}
                </p>
              ))}
            </div>
          </SectionCard>

          <div className="my-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard label="TODAY'S ACTIONS" borderColor="#ff3d5a">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {sortedActions.map((item, i) => {
                  const ps = priorityStyle(item.priority);
                  return (
                    <div
                      key={i}
                      style={{
                        background: '#0d1117',
                        border: '1px solid #1e2a3a',
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Pill label={item.priority.toUpperCase()} style={ps} />
                        {item.ticker && (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 13,
                              fontWeight: 700,
                              color: '#ffd700',
                            }}
                          >
                            {item.ticker}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#e8edf5', marginBottom: 4 }}>{item.action}</div>
                      <div style={{ fontSize: 11, color: '#3d5068', lineHeight: 1.5 }}>{item.rationale}</div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard label="TOP OPPORTUNITIES" borderColor="#3d9aff">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {(report.top_opportunities || []).map((opp, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 8,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 18,
                          fontWeight: 700,
                          color: '#ffd700',
                        }}
                      >
                        {opp.ticker}
                      </span>
                      <Pill label={opp.conviction.toUpperCase()} style={priorityStyle(opp.conviction === 'high' ? 'high' : opp.conviction === 'medium' ? 'medium' : 'low')} />
                    </div>
                    <div style={{ fontSize: 12, color: '#7a8fa8', marginBottom: 6, lineHeight: 1.5 }}>
                      {opp.thesis}
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#3d9aff',
                        marginBottom: 10,
                      }}
                    >
                      {opp.play}
                    </div>
                    <Link
                      href={`/thesis?ticker=${opp.ticker}`}
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
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard label="RISK FLAGS" borderColor="#ff8c3d">
              {(report.risk_flags || []).length === 0 ? (
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                  No significant risk flags today
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {report.risk_flags.map((flag, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#0d1117',
                        border: '1px solid #1e2a3a',
                        borderRadius: 8,
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <Pill label={flag.severity.toUpperCase()} style={severityStyle(flag.severity)} />
                      <span style={{ fontSize: 12, color: '#e8edf5', lineHeight: 1.5 }}>{flag.flag}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard label="POSITIONS REVIEW" borderColor="#3d9aff">
            {(report.positions_review || []).length === 0 ? (
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8', textAlign: 'center', padding: 24 }}>
                No open positions to review
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['TICKER', 'RECOMMENDATION', 'RATIONALE', 'P&L %'].map((h) => (
                        <th
                          key={h}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 8,
                            letterSpacing: 2,
                            color: '#7a8fa8',
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderBottom: '1px solid #1e2a3a',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.positions_review.map((pos, i) => {
                      const rs = recommendationStyle(pos.recommendation);
                      const pnl = pos.current_pnl_pct;
                      return (
                        <tr key={i}>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 14,
                              fontWeight: 700,
                              color: '#ffd700',
                              padding: '12px',
                              borderBottom: '1px solid #1e2a3a20',
                            }}
                          >
                            {pos.ticker}
                          </td>
                          <td style={{ padding: '12px', borderBottom: '1px solid #1e2a3a20' }}>
                            <Pill label={pos.recommendation.toUpperCase()} style={rs} />
                          </td>
                          <td
                            style={{
                              fontSize: 12,
                              color: '#7a8fa8',
                              padding: '12px',
                              borderBottom: '1px solid #1e2a3a20',
                              maxWidth: 360,
                            }}
                          >
                            {pos.rationale}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 12,
                              color:
                                pnl != null ? (pnl >= 0 ? '#00ff88' : '#ff3d5a') : '#3d5068',
                              padding: '12px',
                              borderBottom: '1px solid #1e2a3a20',
                            }}
                          >
                            {pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
