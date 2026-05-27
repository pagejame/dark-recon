'use client';

import { useState, useEffect } from 'react';

interface Decision {
  action: 'AUTO_EXECUTE' | 'QUEUE_FOR_APPROVAL' | 'NOTIFY' | 'SKIP';
  issue: string;
  rationale: string;
  priority: string;
  ticker?: string;
  endpoint?: string;
}

interface AgentRun {
  id: string;
  status: string;
  ran_at: string;
  duration_ms?: number;
  job_name?: string;
  results?: {
    executed?: number;
    queued?: number;
    notified?: number;
    skipped?: number;
    errors?: string[];
    decisions?: Decision[] | number;
    platform_snapshot?: string;
    agent?: {
      executed?: number;
      queued?: number;
      notified?: number;
      decisions?: number;
    };
  };
}

interface AgentRunResult {
  executed: number;
  queued: number;
  notified: number;
  skipped: number;
  decisions: Decision[];
  error?: string;
}

const ACTION_CONFIG = {
  AUTO_EXECUTE: {
    color: '#00ff88',
    bg: '#00ff8815',
    border: '#00ff8840',
    icon: '⚡',
    label: 'AUTO EXECUTED',
  },
  QUEUE_FOR_APPROVAL: {
    color: '#3d9aff',
    bg: '#3d9aff15',
    border: '#3d9aff40',
    icon: '📋',
    label: 'QUEUED',
  },
  NOTIFY: {
    color: '#ffd700',
    bg: '#ffd70015',
    border: '#ffd70040',
    icon: '🔔',
    label: 'NOTIFIED',
  },
  SKIP: { color: '#3d5068', bg: '#1e2a3a', border: '#1e2a3a', icon: '—', label: 'SKIPPED' },
};

const PRIORITY_COLORS = {
  critical: '#ff3d5a',
  high: '#ffd700',
  medium: '#3d9aff',
  low: '#3d5068',
};

function RunCard({
  run,
  expanded,
  onToggle,
}: {
  run: AgentRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const decisionsList = Array.isArray(run.results?.decisions) ? run.results.decisions : [];
  const decisionsCount = Array.isArray(run.results?.decisions)
    ? run.results.decisions.length
    : typeof run.results?.decisions === 'number'
      ? run.results.decisions
      : run.results?.agent?.decisions ?? 0;
  const executed =
    typeof run.results?.executed === 'number'
      ? run.results.executed
      : parseInt(String(run.results?.executed || run.results?.agent?.executed || '0'), 10) || 0;
  const queued =
    typeof run.results?.queued === 'number'
      ? run.results.queued
      : parseInt(String(run.results?.queued || run.results?.agent?.queued || '0'), 10) || 0;
  const notified =
    typeof run.results?.notified === 'number'
      ? run.results.notified
      : parseInt(String(run.results?.notified || run.results?.agent?.notified || '0'), 10) || 0;
  const errors = Array.isArray(run.results?.errors) ? run.results.errors : [];
  const timeAgo = run.ran_at
    ? Math.floor((Date.now() - new Date(run.ran_at).getTime()) / 60000)
    : 0;

  const hasAction = executed > 0 || queued > 0 || notified > 0;

  return (
    <div
      style={{
        background: '#111620',
        border: `1px solid ${hasAction ? '#1e2a3a' : '#0d1117'}`,
        borderLeft: `3px solid ${run.status === 'success' ? (hasAction ? '#00ff88' : '#1e2a3a') : '#ffd700'}`,
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background: run.status === 'success' ? (hasAction ? '#00ff88' : '#3d5068') : '#ffd700',
            }}
          />

          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
            {new Date(run.ran_at).toLocaleTimeString()} · {timeAgo}m ago
          </span>

          {executed > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#00ff8815',
                border: '1px solid #00ff8840',
                color: '#00ff88',
              }}
            >
              ⚡ {executed} executed
            </span>
          )}
          {queued > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#3d9aff15',
                border: '1px solid #3d9aff40',
                color: '#3d9aff',
              }}
            >
              📋 {queued} queued
            </span>
          )}
          {notified > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#ffd70015',
                border: '1px solid #ffd70040',
                color: '#ffd700',
              }}
            >
              🔔 {notified} flagged
            </span>
          )}
          {!hasAction && decisionsCount > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#3d506815',
                border: '1px solid #3d506840',
                color: '#7a8fa8',
              }}
            >
              {decisionsCount} decision{decisionsCount !== 1 ? 's' : ''}
            </span>
          )}
          {!hasAction && decisionsCount === 0 && (
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', letterSpacing: 1 }}>
              — No actions needed
            </span>
          )}
          {errors.length > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#ff3d5a15',
                border: '1px solid #ff3d5a40',
                color: '#ff3d5a',
              }}
            >
              ✗ {errors.length} error{errors.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {run.duration_ms && (
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
              {(run.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #1e2a3a', padding: '14px 18px' }}>
          {decisionsList.length === 0 && (
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068', letterSpacing: 1 }}>
              {decisionsCount > 0
                ? `${decisionsCount} decisions recorded (summary only)`
                : 'No decisions recorded for this run'}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {decisionsList.map((d, i) => {
              const config = ACTION_CONFIG[d.action] || ACTION_CONFIG.SKIP;
              const priColor =
                PRIORITY_COLORS[d.priority as keyof typeof PRIORITY_COLORS] || '#3d5068';

              return (
                <div
                  key={i}
                  style={{
                    background: config.bg,
                    border: `1px solid ${config.border}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{config.icon}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 1,
                          color: config.color,
                          fontWeight: 700,
                        }}
                      >
                        {config.label}
                      </span>
                      {d.ticker && (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: '#ffd700',
                            fontWeight: 700,
                          }}
                        >
                          {d.ticker}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 7,
                          letterSpacing: 1,
                          color: priColor,
                          opacity: 0.8,
                        }}
                      >
                        {d.priority?.toUpperCase()}
                      </span>
                    </div>

                    <div
                      style={{ fontSize: 13, color: '#e8edf5', marginBottom: 4, fontWeight: 500 }}
                    >
                      {d.issue}
                    </div>

                    <div style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.6 }}>
                      {d.rationale}
                    </div>

                    {d.endpoint && d.action === 'AUTO_EXECUTE' && (
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          color: '#3d5068',
                          marginTop: 6,
                          letterSpacing: 1,
                        }}
                      >
                        → {d.endpoint}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {errors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {errors.map((err, i) => (
                <div
                  key={i}
                  style={{ fontFamily: 'monospace', fontSize: 10, color: '#ff3d5a', padding: '4px 0' }}
                >
                  ✗ {err}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<AgentRunResult | null>(null);
  const [lastRunResult, setLastRunResult] = useState<string | null>(null);

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/agent/runs');
      let data: { runs?: AgentRun[] } = {};
      try {
        data = await res.json();
      } catch {
        setRuns([]);
        return [];
      }
      const nextRuns = Array.isArray(data.runs) ? data.runs : [];
      setRuns(nextRuns);
      return nextRuns;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
    const interval = setInterval(() => void fetchRuns(), 30000);
    return () => clearInterval(interval);
  }, []);

  const runAgentNow = async () => {
    setRunning(true);
    setLiveResult(null);
    setLastRunResult(null);
    try {
      const res = await fetch('/api/agent/run', { method: 'POST' });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        setLastRunResult('Failed to parse agent response');
        return;
      }
      if (data.success) {
        setLastRunResult(
          `✓ Agent ran — ${Number(data.executed) || 0} executed, ${Number(data.decisions) || 0} decisions`
        );
        setLiveResult({
          executed: Number(data.executed) || 0,
          queued: Number(data.queued) || 0,
          notified: Number(data.notified) || 0,
          skipped: Number(data.skipped) || 0,
          decisions: [],
        });
        const nextRuns = await fetchRuns();
        if (nextRuns[0]?.id) setExpandedRun(nextRuns[0].id);
      } else {
        setLastRunResult(`Error: ${String(data.error || 'Unknown error')}`);
      }
    } catch {
      setLastRunResult('Failed to run agent');
      setLiveResult({
        error: 'Agent run failed',
        executed: 0,
        queued: 0,
        notified: 0,
        skipped: 0,
        decisions: [],
      });
    } finally {
      setRunning(false);
    }
  };

  const totalExecuted = runs.reduce((sum, r) => {
    const executed = parseInt(
      String(r.results?.executed ?? r.results?.agent?.executed ?? '0'),
      10
    );
    return sum + (Number.isNaN(executed) ? 0 : executed);
  }, 0);
  const totalQueued = runs.reduce((sum, r) => {
    const queued = parseInt(
      String(r.results?.queued ?? r.results?.agent?.queued ?? '0'),
      10
    );
    return sum + (Number.isNaN(queued) ? 0 : queued);
  }, 0);
  const lastRun = runs[0];
  const minutesSinceLastRun = lastRun
    ? Math.floor((Date.now() - new Date(lastRun.ran_at).getTime()) / 60000)
    : null;

  return (
    <div className="dr-page dr-page-narrow">
      <div style={{ marginBottom: 28 }}>
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 'clamp(20px, 5vw, 32px)',
                fontWeight: 800,
                color: '#e8edf5',
                margin: 0,
              }}
            >
              Autonomous Agent
            </h1>
            <div style={{ fontSize: 'clamp(11px, 3vw, 14px)', color: '#7a8fa8', marginTop: 4 }}>
              Every decision, every action, every rationale — full transparency
            </div>
          </div>
          <div>
            <button
              onClick={() => void runAgentNow()}
              disabled={running}
              style={{
                padding: '10px 24px',
                background: running ? '#1e2a3a' : '#00ff88',
                border: 'none',
                borderRadius: 8,
                color: running ? '#7a8fa8' : '#080a0f',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {running ? '⟳ RUNNING...' : '⚡ RUN AGENT NOW'}
            </button>
            {lastRunResult && (
              <div
                style={{
                  marginTop: 8,
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: lastRunResult.startsWith('✓') ? '#00ff88' : '#ff3d5a',
                  letterSpacing: 1,
                }}
              >
                {lastRunResult}
              </div>
            )}
          </div>
        </div>
      </div>

      {liveResult && !liveResult.error && (
        <div
          style={{
            background: '#00ff8808',
            border: '1px solid #00ff8830',
            borderLeft: '3px solid #00ff88',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#00ff88',
              marginBottom: 10,
            }}
          >
            LATEST RUN COMPLETE
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#00ff88' }}>
              ⚡ {liveResult.executed} executed
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#3d9aff' }}>
              📋 {liveResult.queued} queued
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#ffd700' }}>
              🔔 {liveResult.notified} flagged
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#3d5068' }}>
              — {liveResult.skipped} skipped
            </div>
          </div>
          {(liveResult.decisions || [])
            .filter((d) => d.action !== 'SKIP')
            .map((d, i) => {
              const config = ACTION_CONFIG[d.action] || ACTION_CONFIG.SKIP;
              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    marginBottom: 6,
                    background: config.bg,
                    border: `1px solid ${config.border}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 12 }}>{config.icon}</span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 8,
                        color: config.color,
                        letterSpacing: 1,
                      }}
                    >
                      {config.label}
                    </span>
                    {d.ticker && (
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#ffd700' }}>
                        {d.ticker}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#e8edf5', marginBottom: 2 }}>{d.issue}</div>
                  <div style={{ fontSize: 11, color: '#7a8fa8' }}>{d.rationale}</div>
                </div>
              );
            })}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          { label: 'TOTAL RUNS', value: runs.length, color: '#7a8fa8' },
          { label: 'ACTIONS TAKEN', value: totalExecuted, color: '#00ff88' },
          { label: 'TRADES QUEUED', value: totalQueued, color: '#3d9aff' },
          {
            label: 'LAST RUN',
            value: minutesSinceLastRun !== null ? `${minutesSinceLastRun}m ago` : '—',
            color: '#ffd700',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: '#111620',
              border: '1px solid #1e2a3a',
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
              {stat.label}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: '#0d1117',
          border: '1px solid #1e2a3a',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 20,
          fontFamily: 'monospace',
          fontSize: 9,
          color: '#3d5068',
          letterSpacing: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span>AUTONOMOUS SCHEDULE: Every 10 minutes · Mon-Fri 9AM-5PM ET</span>
        <span style={{ color: lastRun?.status === 'success' ? '#00ff88' : '#ffd700' }}>
          {lastRun ? `Last: ${new Date(lastRun.ran_at).toLocaleTimeString()}` : 'No runs yet'}
        </span>
      </div>

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          LOADING RUN HISTORY...
        </div>
      ) : runs.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#3d5068',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          NO RUNS YET — Click RUN AGENT NOW to start
        </div>
      ) : (
        <div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#7a8fa8',
              marginBottom: 12,
            }}
          >
            RUN HISTORY ({runs.length})
          </div>
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              expanded={expandedRun === run.id}
              onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
