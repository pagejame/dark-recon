'use client';

import { useState, useEffect, useCallback } from 'react';

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  latency_ms?: number;
}

interface HealthResult {
  overall: 'pass' | 'fail' | 'warn';
  passing: number;
  failing: number;
  warnings: number;
  total: number;
  checks: HealthCheck[];
  checked_at: string;
  ready_for_launch: boolean;
  launch_message: string;
}

function StatusIcon({ status }: { status: 'pass' | 'fail' | 'warn' | 'loading' }) {
  if (status === 'loading') return <span style={{ color: '#3d5068', fontSize: 16 }}>⟳</span>;
  if (status === 'pass') return <span style={{ color: '#00ff88', fontSize: 16 }}>✓</span>;
  if (status === 'warn') return <span style={{ color: '#ffd700', fontSize: 16 }}>⚠</span>;
  return <span style={{ color: '#ff3d5a', fontSize: 16 }}>✗</span>;
}

function StatusPill({ status }: { status: 'pass' | 'fail' | 'warn' }) {
  const config = {
    pass: { bg: '#00ff8815', border: '#00ff8840', color: '#00ff88', label: 'PASS' },
    warn: { bg: '#ffd70015', border: '#ffd70040', color: '#ffd700', label: 'WARN' },
    fail: { bg: '#ff3d5a15', border: '#ff3d5a40', color: '#ff3d5a', label: 'FAIL' },
  }[status];

  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 8,
        letterSpacing: 2,
        padding: '3px 10px',
        borderRadius: 20,
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
        fontWeight: 700,
      }}
    >
      {config.label}
    </span>
  );
}

export default function LaunchPage() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/health');
      const data = await res.json();
      setResult(data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const overallColor =
    result?.overall === 'pass' ? '#00ff88' : result?.overall === 'warn' ? '#ffd700' : '#ff3d5a';

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
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
            fontSize: 28,
            fontWeight: 800,
            color: '#e8edf5',
            margin: '0 0 8px',
          }}
        >
          Launch Checklist
        </h1>
        <div style={{ fontSize: 14, color: '#7a8fa8' }}>
          System health check — verify everything is green before going live
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
          {lastChecked ? `Last checked: ${lastChecked}` : 'Click RUN CHECKS to start'}
        </div>
        <button
          onClick={() => void runChecks()}
          disabled={loading}
          style={{
            padding: '10px 24px',
            background: loading ? '#1e2a3a' : '#00ff88',
            color: loading ? '#7a8fa8' : '#080a0f',
            border: 'none',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 2,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⟳ RUNNING CHECKS...' : '⚡ RUN CHECKS'}
        </button>
      </div>

      {result && (
        <div
          style={{
            background:
              result.overall === 'pass'
                ? '#00ff8808'
                : result.overall === 'warn'
                  ? '#ffd70008'
                  : '#ff3d5a08',
            border: `2px solid ${overallColor}40`,
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 22,
                fontWeight: 700,
                color: overallColor,
                marginBottom: 6,
              }}
            >
              {result.launch_message}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
              {result.passing} passing · {result.warnings} warnings · {result.failing} failing
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 32,
                fontWeight: 700,
                color: overallColor,
              }}
            >
              {result.passing}/{result.total}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 2,
                color: '#7a8fa8',
              }}
            >
              CHECKS PASSING
            </div>
          </div>
        </div>
      )}

      {loading && !result && (
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
          RUNNING SYSTEM CHECKS...
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.checks.map((check, i) => (
            <div
              key={i}
              style={{
                background: '#111620',
                border: `1px solid ${check.status === 'pass' ? '#1e2a3a' : check.status === 'warn' ? '#ffd70030' : '#ff3d5a30'}`,
                borderLeft: `3px solid ${check.status === 'pass' ? '#00ff88' : check.status === 'warn' ? '#ffd700' : '#ff3d5a'}`,
                borderRadius: 10,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <StatusIcon status={check.status} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#e8edf5',
                    }}
                  >
                    {check.name}
                  </span>
                  <StatusPill status={check.status} />
                  {check.latency_ms !== undefined && (
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                      {check.latency_ms}ms
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color:
                      check.status === 'fail'
                        ? '#ff8fa0'
                        : check.status === 'warn'
                          ? '#ffd70090'
                          : '#7a8fa8',
                  }}
                >
                  {check.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 32,
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#3d9aff',
            marginBottom: 16,
          }}
        >
          TUESDAY MORNING LAUNCH SEQUENCE
        </div>
        {[
          {
            time: 'Monday night',
            action: 'Cancel all pending Alpaca orders (XLE, META, LLY limit orders)',
            critical: true,
          },
          {
            time: 'Monday night',
            action: 'Close all open positions — start fresh at $100,000',
            critical: true,
          },
          {
            time: 'Monday night',
            action: 'Clear trade queue in Supabase (delete pending rows)',
            critical: false,
          },
          {
            time: '5:30 AM ET',
            action: 'Open Dark Recon — verify system is live and crons are scheduled',
            critical: true,
          },
          {
            time: '6:00 AM ET',
            action: 'Morning cron fires automatically — brief, scanner, Autopilot, trade queue built',
            critical: false,
          },
          {
            time: '7:00 AM ET',
            action: 'Earnings play cron fires — any upcoming earnings plays queued',
            critical: false,
          },
          {
            time: '9:00 AM ET',
            action: 'Review Trade Queue — approve or pass pre-built trades',
            critical: true,
          },
          {
            time: '9:30 AM ET',
            action: 'Market opens — Dark Recon Alpha begins tracking',
            critical: false,
          },
          {
            time: 'All day',
            action: 'Position monitor checks every 10 min — alerts fire if stops approached',
            critical: false,
          },
          {
            time: '5:00 PM ET',
            action: 'Signal outcome tracker runs — scores all signals from the day',
            critical: false,
          },
        ].map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 14,
              padding: '10px 0',
              borderBottom: i < 9 ? '1px solid #0d1117' : 'none',
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: item.critical ? '#ffd700' : '#3d5068',
                letterSpacing: 1,
                whiteSpace: 'nowrap',
                marginTop: 2,
                minWidth: 90,
              }}
            >
              {item.time}
            </span>
            <span
              style={{
                fontSize: 13,
                color: item.critical ? '#e8edf5' : '#7a8fa8',
                lineHeight: 1.5,
              }}
            >
              {item.critical && <span style={{ color: '#ffd700', marginRight: 6 }}>★</span>}
              {item.action}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 20,
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#7a8fa8',
            marginBottom: 16,
          }}
        >
          AUTONOMOUS CRON SCHEDULE
        </div>
        {[
          {
            time: '6:00 AM ET',
            job: 'Morning Run',
            detail: 'Brief + Scanner + Autopilot + Trade Queue + Earnings Plays',
            freq: 'Mon-Fri',
          },
          {
            time: '7:00 AM ET',
            job: 'Earnings Plays',
            detail: 'Scan watchlist for upcoming earnings, queue options plays',
            freq: 'Mon-Fri',
          },
          {
            time: 'Every 10 min',
            job: 'Position Monitor',
            detail: 'Check stops, drawdown, time decay alerts',
            freq: 'Market hours',
          },
          {
            time: 'Every 15 min',
            job: 'Alert Check',
            detail: 'Price alerts checked against live Alpaca prices',
            freq: 'Market hours',
          },
          {
            time: 'Every 30 min',
            job: 'Position News',
            detail: 'Finnhub news scan on all open positions',
            freq: 'Market hours',
          },
          {
            time: 'Every 5 min',
            job: 'Auto-Close Check',
            detail: 'Queue stop breach closes for approval',
            freq: 'Market hours',
          },
          {
            time: '8AM/12PM/4PM',
            job: 'Intelligence Sweep',
            detail: 'Reddit + SEC + Finnhub signal sweep',
            freq: 'Mon-Fri',
          },
          {
            time: '5:00 PM ET',
            job: 'Outcome Tracker',
            detail: 'Auto-score all signals 1/5/10 day returns',
            freq: 'Mon-Fri',
          },
          {
            time: '6:00 PM ET',
            job: 'Watchlist Auto-Pop',
            detail: 'Add tickers appearing in 2+ signal sources',
            freq: 'Mon-Fri',
          },
          {
            time: '10:00 AM ET',
            job: 'Weekly Email',
            detail: 'Portfolio performance summary via Resend',
            freq: 'Sunday',
          },
        ].map((item, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 140px 1fr 90px',
              gap: 12,
              padding: '8px 0',
              borderBottom: i < 9 ? '1px solid #0d1117' : 'none',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#00ff88' }}>
              {item.time}
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#e8edf5',
                fontWeight: 700,
              }}
            >
              {item.job}
            </span>
            <span style={{ fontSize: 12, color: '#7a8fa8' }}>{item.detail}</span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#3d5068',
                textAlign: 'right',
              }}
            >
              {item.freq}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
