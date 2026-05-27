'use client';

import { useState, useEffect } from 'react';
import TradeQueueCard, { type QueuedTrade } from '@/components/queue/TradeQueueCard';

export default function QueuePage() {
  const [queue, setQueue] = useState<QueuedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<string | null>(null);
  const [investedPct, setInvestedPct] = useState(0);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setQueue(data.queue || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const buildQueue = async () => {
    setBuilding(true);
    setBuildResult(null);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'build' }),
      });
      const data = await res.json();
      setBuildResult(
        data.queued > 0
          ? `✓ ${data.queued} trade${data.queued > 1 ? 's' : ''} queued for approval`
          : '— No trades met the criteria right now'
      );
      await fetchQueue();
    } catch {
      setBuildResult('✗ Failed to build queue');
    } finally {
      setBuilding(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    fetch('/api/trading/account')
      .then((res) => res.json())
      .then((account) => {
        const equity = parseFloat(account.equity || '0');
        const longValue = parseFloat(account.long_market_value || '0');
        if (equity > 0) setInvestedPct((longValue / equity) * 100);
      })
      .catch(() => {});
  }, []);

  const pending = queue.filter((t) => t.status === 'pending');
  const executed = queue.filter((t) => t.status === 'executed');
  const rejected = queue.filter((t) => ['rejected', 'expired'].includes(t.status));

  const handleApprove = (id: string) => {
    setQueue((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'executed' } : t)));
  };

  const handleReject = (id: string) => {
    setQueue((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'rejected' } : t)));
  };

  return (
    <div className="dr-page dr-page-tight">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
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
            Trade Queue
          </h1>
          <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
            Pre-built trades ready for one-tap approval · {pending.length} pending
          </div>
        </div>
        <button
          onClick={buildQueue}
          disabled={building}
          style={{
            padding: '10px 20px',
            background: building ? '#1e2a3a' : '#00ff88',
            color: building ? '#7a8fa8' : '#080a0f',
            border: 'none',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
            fontWeight: 700,
            cursor: building ? 'not-allowed' : 'pointer',
          }}
        >
          {building ? '⟳ BUILDING...' : '⚡ BUILD QUEUE'}
        </button>
      </div>

      {buildResult && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            marginBottom: 20,
            background: buildResult.startsWith('✓') ? '#00ff8810' : '#1e2a3a',
            border: `1px solid ${buildResult.startsWith('✓') ? '#00ff8840' : '#1e2a3a'}`,
            color: buildResult.startsWith('✓') ? '#00ff88' : '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 1,
          }}
        >
          {buildResult}
        </div>
      )}

      {queue.length === 0 && !loading && (
        <div
          style={{
            background: '#111620',
            border: '1px solid #1e2a3a',
            borderRadius: 10,
            padding: 24,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#3d9aff',
              marginBottom: 12,
            }}
          >
            HOW IT WORKS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              '1. Click BUILD QUEUE — Autopilot analyzes all signals and pre-sizes trades that meet your strategy rules',
              '2. Review each trade — see the thesis, catalyst, risk note, and exact position size',
              '3. APPROVE to execute immediately via Alpaca, or PASS with an optional reason',
              '4. Approved trades auto-set stop loss alerts and log to your Trade Journal',
              '5. Morning cron builds the queue automatically at 6AM — ready when you wake up',
            ].map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 13,
                  color: '#7a8fa8',
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: '#00ff88', flexShrink: 0, fontFamily: 'monospace' }}>▸</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
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
          LOADING QUEUE...
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: '#ffd700',
                  marginBottom: 12,
                }}
              >
                PENDING APPROVAL ({pending.length})
              </div>
              {pending.map((trade) => (
                <TradeQueueCard
                  key={trade.id}
                  trade={trade}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  existingPositionsPct={investedPct}
                />
              ))}
            </div>
          )}

          {executed.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: '#00ff88',
                  marginBottom: 12,
                }}
              >
                EXECUTED TODAY ({executed.length})
              </div>
              {executed.map((trade) => (
                <TradeQueueCard
                  key={trade.id}
                  trade={trade}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  existingPositionsPct={investedPct}
                />
              ))}
            </div>
          )}

          {rejected.length > 0 && (
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
                PASSED / EXPIRED ({rejected.length})
              </div>
              {rejected.map((trade) => (
                <TradeQueueCard
                  key={trade.id}
                  trade={trade}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  existingPositionsPct={investedPct}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
