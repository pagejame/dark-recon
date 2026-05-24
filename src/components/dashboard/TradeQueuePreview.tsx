'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { QueuedTrade } from '@/components/queue/TradeQueueCard';

export default function TradeQueuePreview() {
  const [queue, setQueue] = useState<QueuedTrade[]>([]);
  const [building, setBuilding] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setQueue(data.queue || []);
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const pending = queue.filter((t) => t.status === 'pending');

  const buildQueue = async () => {
    setBuilding(true);
    try {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'build' }),
      });
      await fetchQueue();
    } catch {
      // silent
    } finally {
      setBuilding(false);
    }
  };

  const approveTrade = async (id: string) => {
    setExecutingId(id);
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) {
        setQueue((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'executed' } : t)));
      }
    } catch {
      // silent
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderLeft: '3px solid #ffd700',
        borderRadius: 10,
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#ffd700',
            }}
          >
            TRADE QUEUE
          </span>
          {pending.length > 0 && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 1,
                color: '#ffd700',
                background: '#ffd70015',
                border: '1px solid #ffd70040',
                padding: '2px 10px',
                borderRadius: 20,
              }}
            >
              {pending.length} PENDING
            </span>
          )}
        </div>
        <Link
          href="/queue"
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#ffd700',
            letterSpacing: 1,
            textDecoration: 'none',
          }}
        >
          Full Queue →
        </Link>
      </div>

      {pending.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.slice(0, 3).map((trade) => (
            <div
              key={trade.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: '#0d1117',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                padding: '10px 14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#ffd700',
                  }}
                >
                  {trade.ticker}
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 8,
                    letterSpacing: 1,
                    color: trade.direction === 'long' ? '#00ff88' : '#ff3d5a',
                  }}
                >
                  {trade.direction.toUpperCase()}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                  ${Number(trade.dollar_amount).toLocaleString()} · {trade.conviction_score}/10
                </span>
              </div>
              <button
                onClick={() => approveTrade(trade.id)}
                disabled={executingId === trade.id}
                style={{
                  padding: '6px 16px',
                  background: executingId === trade.id ? '#1e2a3a' : '#00ff88',
                  color: executingId === trade.id ? '#7a8fa8' : '#080a0f',
                  border: 'none',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 1,
                  fontWeight: 700,
                  cursor: executingId === trade.id ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {executingId === trade.id ? 'EXECUTING...' : '⚡ APPROVE'}
              </button>
            </div>
          ))}
          {pending.length > 3 && (
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', letterSpacing: 1 }}>
              +{pending.length - 3} more in queue
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#7a8fa8' }}>
            Queue is empty — Autopilot builds trades at 6AM
          </span>
          <button
            onClick={buildQueue}
            disabled={building}
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              color: '#ffd700',
              background: '#ffd70015',
              border: '1px solid #ffd70040',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: building ? 'wait' : 'pointer',
            }}
          >
            {building ? 'BUILDING...' : 'BUILD NOW'}
          </button>
        </div>
      )}
    </div>
  );
}
