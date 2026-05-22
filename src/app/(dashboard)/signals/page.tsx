'use client';

import { useState, useEffect, useCallback } from 'react';

interface Signal {
  id: string;
  ticker: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  summary: string;
  status: string;
  created_at: string;
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  momentum_breakout: 'Momentum Breakout',
  unusual_volume: 'Unusual Volume',
  unusual_options: 'Unusual Options',
  reversal_candidate: 'Reversal',
  sector_leader: 'Sector Leader',
  insider_activity: 'Insider Activity',
  squeeze_candidate: 'Squeeze Setup',
};

const STRENGTH_COLORS = {
  high: { bg: '#00ff8815', text: '#00ff88', border: '#00ff8840' },
  medium: { bg: '#ffd70015', text: '#ffd700', border: '#ffd70040' },
  low: { bg: '#7a8fa815', text: '#7a8fa8', border: '#7a8fa840' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#7a8fa8',
  confirmed: '#00ff88',
  passed: '#ff3d5a',
  executed: '#3d9aff',
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      setSignals(data.signals || []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  const runNewScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan?fresh=true');
      const data = await res.json();
      setSignals(data.signals || []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // silent fail
    } finally {
      setScanning(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/signals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const filteredSignals = signals.filter((s) => {
    if (filter !== 'all' && s.strength !== filter) return false;
    if (typeFilter !== 'all' && s.signal_type !== typeFilter) return false;
    return true;
  });

  const highCount = signals.filter((s) => s.strength === 'high').length;
  const allTypes = [...new Set(signals.map((s) => s.signal_type))];

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
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
            Signal Intelligence
          </h1>
          <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
            {signals.length} signals · {highCount} high conviction
            {lastUpdated && <span> · Updated {lastUpdated}</span>}
          </div>
        </div>
        <button
          onClick={runNewScan}
          disabled={scanning}
          style={{
            padding: '10px 20px',
            background: scanning ? '#1e2a3a' : '#00ff88',
            color: scanning ? '#7a8fa8' : '#080a0f',
            border: 'none',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
            fontWeight: 700,
            cursor: scanning ? 'not-allowed' : 'pointer',
          }}
        >
          {scanning ? 'SCANNING...' : '⟳ RUN SCAN'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'TOTAL SIGNALS', value: signals.length, color: '#3d9aff' },
          { label: 'HIGH CONVICTION', value: highCount, color: '#00ff88' },
          {
            label: 'PENDING ACTION',
            value: signals.filter((s) => s.status === 'pending').length,
            color: '#ffd700',
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
                letterSpacing: 3,
                color: '#7a8fa8',
                marginBottom: 8,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 28,
                fontWeight: 700,
                color: card.color,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#7a8fa8',
            letterSpacing: 2,
            display: 'flex',
            alignItems: 'center',
            marginRight: 4,
          }}
        >
          STRENGTH:
        </div>
        {(['all', 'high', 'medium', 'low'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${filter === f ? '#00ff88' : '#1e2a3a'}`,
              background: filter === f ? '#00ff8815' : '#111620',
              color: filter === f ? '#00ff88' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#7a8fa8',
            letterSpacing: 2,
            display: 'flex',
            alignItems: 'center',
            marginLeft: 8,
            marginRight: 4,
          }}
        >
          TYPE:
        </div>
        <button
          onClick={() => setTypeFilter('all')}
          style={{
            padding: '4px 12px',
            borderRadius: 20,
            border: `1px solid ${typeFilter === 'all' ? '#3d9aff' : '#1e2a3a'}`,
            background: typeFilter === 'all' ? '#3d9aff15' : '#111620',
            color: typeFilter === 'all' ? '#3d9aff' : '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 1,
            cursor: 'pointer',
          }}
        >
          ALL
        </button>
        {allTypes.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${typeFilter === t ? '#3d9aff' : '#1e2a3a'}`,
              background: typeFilter === t ? '#3d9aff15' : '#111620',
              color: typeFilter === t ? '#3d9aff' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {(SIGNAL_TYPE_LABELS[t] || t).toUpperCase()}
          </button>
        ))}
      </div>

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
          SCANNING MARKETS...
        </div>
      ) : filteredSignals.length === 0 ? (
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
          NO SIGNALS MATCH FILTER
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredSignals.map((signal) => {
            const sc = STRENGTH_COLORS[signal.strength];
            const isExpanded = expandedId === signal.id;
            return (
              <div
                key={signal.id}
                style={{
                  background: '#111620',
                  border: '1px solid #1e2a3a',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#ffd700',
                      minWidth: 60,
                    }}
                  >
                    {signal.ticker}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#7a8fa8', flex: 1 }}>
                    {(SIGNAL_TYPE_LABELS[signal.signal_type] || signal.signal_type).toUpperCase()}
                  </span>
                  <span
                    style={{
                      background: sc.bg,
                      color: sc.text,
                      border: `1px solid ${sc.border}`,
                      padding: '2px 10px',
                      borderRadius: 20,
                      fontFamily: 'monospace',
                      fontSize: 9,
                      letterSpacing: 2,
                      fontWeight: 700,
                    }}
                  >
                    {signal.strength.toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      color: STATUS_COLORS[signal.status] || '#7a8fa8',
                      letterSpacing: 1,
                    }}
                  >
                    {signal.status?.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                    {new Date(signal.created_at).toLocaleTimeString()}
                  </span>
                  <span style={{ color: '#3d5068', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1e2a3a' }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#7a8fa8',
                        lineHeight: 1.7,
                        marginTop: 12,
                        marginBottom: 14,
                      }}
                    >
                      {signal.summary}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => updateStatus(signal.id, 'confirmed')}
                        style={{
                          padding: '6px 14px',
                          background: '#00ff8815',
                          border: '1px solid #00ff8840',
                          borderRadius: 8,
                          color: '#00ff88',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: 'pointer',
                        }}
                      >
                        ✓ CONFIRM
                      </button>
                      <button
                        onClick={() => updateStatus(signal.id, 'passed')}
                        style={{
                          padding: '6px 14px',
                          background: '#ff3d5a15',
                          border: '1px solid #ff3d5a40',
                          borderRadius: 8,
                          color: '#ff3d5a',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: 'pointer',
                        }}
                      >
                        ✕ PASS
                      </button>
                      <button
                        onClick={() => updateStatus(signal.id, 'executed')}
                        style={{
                          padding: '6px 14px',
                          background: '#3d9aff15',
                          border: '1px solid #3d9aff40',
                          borderRadius: 8,
                          color: '#3d9aff',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ EXECUTED
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
