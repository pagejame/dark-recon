'use client';

import { useState } from 'react';

interface QueuedTrade {
  id: string;
  ticker: string;
  direction: string;
  instrument_type: string;
  qty?: number;
  entry_type: string;
  limit_price?: number;
  options_symbol?: string;
  strike_price?: number;
  expiration_date?: string;
  contracts?: number;
  position_size_pct: number;
  dollar_amount: number;
  stop_loss_price?: number;
  stop_loss_pct: number;
  conviction_score: number;
  signal_sources: string[];
  thesis_summary: string;
  key_catalyst: string;
  risk_note: string;
  status: string;
  expires_at: string;
  queued_at: string;
}

interface TradeQueueCardProps {
  trade: QueuedTrade;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  existingPositionsPct?: number;
}

export default function TradeQueueCard({
  trade,
  onApprove,
  onReject,
  existingPositionsPct = 0,
}: TradeQueueCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const expiresIn = Math.max(
    0,
    Math.floor((new Date(trade.expires_at).getTime() - Date.now()) / 60000)
  );
  const isExpiringSoon = expiresIn < 60;

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/queue/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(`✓ ${data.message}`);
      onApprove(trade.id);
    } catch (e) {
      setResult(`✗ ${e instanceof Error ? e.message : 'Execution failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await fetch(`/api/queue/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejection_reason: rejectReason || 'Rejected by user',
        }),
      });
      onReject(trade.id, rejectReason);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const convictionColor =
    trade.conviction_score >= 9 ? '#00ff88' : trade.conviction_score >= 7 ? '#ffd700' : '#ff8c3d';

  return (
    <div
      style={{
        background: '#111620',
        border: `1px solid ${trade.status === 'executed' ? '#00ff8840' : '#1e2a3a'}`,
        borderLeft: `3px solid ${convictionColor}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        opacity: trade.status !== 'pending' ? 0.7 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#ffd700' }}
          >
            {trade.ticker}
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              fontWeight: 700,
              color: trade.direction === 'long' ? '#00ff88' : '#ff3d5a',
              background: trade.direction === 'long' ? '#00ff8815' : '#ff3d5a15',
              border: `1px solid ${trade.direction === 'long' ? '#00ff8840' : '#ff3d5a40'}`,
              padding: '3px 10px',
              borderRadius: 20,
            }}
          >
            {trade.direction.toUpperCase()}
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              color: '#7a8fa8',
              background: '#1e2a3a',
              padding: '3px 10px',
              borderRadius: 20,
            }}
          >
            {trade.instrument_type.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 2,
              }}
            >
              CONVICTION
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 18,
                fontWeight: 700,
                color: convictionColor,
              }}
            >
              {trade.conviction_score}/10
            </div>
          </div>
          {trade.status === 'pending' && (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 2,
                  color: '#7a8fa8',
                  marginBottom: 2,
                }}
              >
                EXPIRES
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: isExpiringSoon ? '#ff3d5a' : '#7a8fa8',
                }}
              >
                {expiresIn}m
              </div>
            </div>
          )}
          {trade.status !== 'pending' && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                padding: '4px 12px',
                borderRadius: 20,
                background:
                  trade.status === 'executed'
                    ? '#00ff8815'
                    : trade.status === 'rejected'
                      ? '#ff3d5a15'
                      : '#1e2a3a',
                color:
                  trade.status === 'executed'
                    ? '#00ff88'
                    : trade.status === 'rejected'
                      ? '#ff3d5a'
                      : '#7a8fa8',
                border: `1px solid ${trade.status === 'executed' ? '#00ff8840' : '#1e2a3a'}`,
              }}
            >
              {trade.status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ background: '#0d1117', borderRadius: 8, padding: '10px 12px' }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: '#7a8fa8',
              marginBottom: 4,
            }}
          >
            {trade.instrument_type === 'stock' ? 'SHARES' : 'CONTRACTS'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#e8edf5' }}>
            {trade.qty || trade.contracts}
          </div>
        </div>
        <div style={{ background: '#0d1117', borderRadius: 8, padding: '10px 12px' }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: '#7a8fa8',
              marginBottom: 4,
            }}
          >
            {trade.entry_type === 'limit' ? 'LIMIT PRICE' : 'MARKET ORDER'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#e8edf5' }}>
            {trade.limit_price ? `$${Number(trade.limit_price).toFixed(2)}` : 'AT OPEN'}
          </div>
        </div>
        <div
          style={{
            background: (trade.position_size_pct || 0) > 8 ? '#ffd70015' : '#0d1117',
            border: `1px solid ${(trade.position_size_pct || 0) > 8 ? '#ffd70040' : '#1e2a3a'}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: '#7a8fa8',
              marginBottom: 4,
            }}
          >
            POSITION SIZE
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 16,
              fontWeight: 700,
              color: (trade.position_size_pct || 0) > 8 ? '#ffd700' : '#e8edf5',
            }}
          >
            {trade.position_size_pct?.toFixed(1)}%
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8', marginTop: 2 }}>
            ${trade.dollar_amount?.toLocaleString()}
          </div>
          {(trade.position_size_pct || 0) > 8 && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                color: '#ffd700',
                marginTop: 4,
                letterSpacing: 1,
              }}
            >
              ⚠ LARGE POSITION
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          color: '#3d5068',
          marginTop: 8,
          marginBottom: 14,
          letterSpacing: 1,
        }}
      >
        PORTFOLIO IMPACT: This trade uses {trade.position_size_pct?.toFixed(1)}% of your portfolio · After
        execution:{' '}
        {Math.min(100, existingPositionsPct + (trade.position_size_pct || 0)).toFixed(0)}% invested
      </div>

      {trade.options_symbol && (
        <div
          style={{
            background: '#0d1117',
            border: '1px solid #1e2a3a',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 12,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#3d9aff',
          }}
        >
          {trade.options_symbol} · Strike ${trade.strike_price} · Exp {trade.expiration_date}
        </div>
      )}

      <div style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.7, marginBottom: 10 }}>
        {trade.thesis_summary}
      </div>

      <div
        style={{
          background: '#ff8c3d10',
          border: '1px solid #ff8c3d30',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 8,
            letterSpacing: 2,
            color: '#ff8c3d',
            marginRight: 8,
          }}
        >
          CATALYST
        </span>
        <span style={{ fontSize: 12, color: '#e8edf5' }}>{trade.key_catalyst}</span>
      </div>

      <div
        style={{
          background: '#ff3d5a08',
          border: '1px solid #ff3d5a20',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 8,
            letterSpacing: 2,
            color: '#ff3d5a',
            marginRight: 8,
          }}
        >
          RISK
        </span>
        <span style={{ fontSize: 12, color: '#7a8fa8' }}>{trade.risk_note}</span>
        {trade.stop_loss_price && (
          <span
            style={{ fontFamily: 'monospace', fontSize: 10, color: '#ff3d5a', marginLeft: 8 }}
          >
            Stop: ${trade.stop_loss_price} ({trade.stop_loss_pct}%)
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {(trade.signal_sources || []).map((src, i) => (
          <span
            key={i}
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 1,
              color: '#7a8fa8',
              background: '#1e2a3a',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {src}
          </span>
        ))}
      </div>

      {result && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
            background: result.startsWith('✓') ? '#00ff8810' : '#ff3d5a10',
            border: `1px solid ${result.startsWith('✓') ? '#00ff8840' : '#ff3d5a40'}`,
            color: result.startsWith('✓') ? '#00ff88' : '#ff8fa0',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          {result}
        </div>
      )}

      {trade.status === 'pending' && !result && (
        <div>
          {showRejectInput ? (
            <div>
              <input
                type="text"
                placeholder="Reason for passing (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0d1117',
                  border: '1px solid #1e2a3a',
                  borderRadius: 8,
                  color: '#e8edf5',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 10,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowRejectInput(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    borderRadius: 8,
                    color: '#7a8fa8',
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 2,
                    cursor: 'pointer',
                  }}
                >
                  BACK
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  style={{
                    flex: 2,
                    padding: 12,
                    background: '#ff3d5a15',
                    border: '1px solid #ff3d5a40',
                    borderRadius: 8,
                    color: '#ff3d5a',
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 2,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  CONFIRM PASS
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowRejectInput(true)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: 14,
                  background: '#111620',
                  border: '1px solid #1e2a3a',
                  borderRadius: 10,
                  color: '#7a8fa8',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 2,
                  cursor: 'pointer',
                }}
              >
                ✕ PASS
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                style={{
                  flex: 3,
                  padding: 14,
                  background: loading ? '#1e2a3a' : '#00ff88',
                  color: loading ? '#7a8fa8' : '#080a0f',
                  border: 'none',
                  borderRadius: 10,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  letterSpacing: 2,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'EXECUTING...' : '⚡ APPROVE & EXECUTE'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { QueuedTrade };
