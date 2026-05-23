'use client';

import { useCallback, useEffect, useState } from 'react';

interface CronRun {
  id: string;
  job_name: string;
  status: 'success' | 'partial' | 'failed';
  ran_at: string;
}

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_STYLES: Record<CronRun['status'], { color: string; bg: string; border: string }> = {
  success: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
  partial: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
  failed: { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' },
};

function formatJobName(name: string) {
  return name.replace(/-/g, ' ').toUpperCase();
}

export default function CronStatusWidget() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/status');
      const data = await res.json();
      setRuns((data.runs || []).slice(0, 3));
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderLeft: '3px solid #3d5068',
        borderRadius: 10,
        padding: '14px 20px',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 3,
          color: '#3d5068',
          marginBottom: 12,
        }}
      >
        SYSTEM STATUS
      </div>

      {loading ? (
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068' }}>Loading…</div>
      ) : runs.length === 0 ? (
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
          Cron jobs scheduled — first run at 6AM ET tomorrow
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {runs.map((run) => {
            const style = STATUS_STYLES[run.status] || STATUS_STYLES.partial;
            return (
              <div
                key={run.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: '1px solid #1e2a3a20',
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: '#7a8fa8',
                    letterSpacing: 1,
                  }}
                >
                  {formatJobName(run.job_name)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: style.color,
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      padding: '2px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {run.status.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                    {timeAgo(run.ran_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
