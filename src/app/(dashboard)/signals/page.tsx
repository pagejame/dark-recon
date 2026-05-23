'use client';

import { useState, useEffect, useCallback } from 'react';
import TradeModal from '@/components/trading/TradeModal';

interface Signal {
  id: string;
  ticker: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  summary: string;
  status: string;
  created_at?: string;
  scanned_at?: string;
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
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeSignal, setTradeSignal] = useState<Signal | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);

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

  const openTradeModal = (signal: Signal) => {
    setTradeSignal(signal);
    setTradeError(null);
    setTradeModalOpen(true);
  };

  const executeTrade = async (order: {
    qty: number;
    order_type: 'market' | 'limit';
    limit_price?: number;
  }) => {
    if (!tradeSignal) return;
    setTradeLoading(true);
    setTradeError(null);
    try {
      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: tradeSignal.ticker,
          qty: order.qty,
          side: 'buy',
          order_type: order.order_type,
          limit_price: order.limit_price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');
      await updateStatus(tradeSignal.id, 'executed');
      setTradeSuccess('Order submitted');
      setTimeout(() => setTradeSuccess(null), 3000);
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'Order failed');
      throw e;
    } finally {
      setTradeLoading(false);
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

  useEffect(() => {
    const onPullRefresh = () => fetchSignals();
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [fetchSignals]);

  const filteredSignals = signals.filter((s) => {
    if (filter !== 'all' && s.strength !== filter) return false;
    if (typeFilter !== 'all' && s.signal_type !== typeFilter) return false;
    return true;
  });

  const highCount = signals.filter((s) => s.strength === 'high').length;
  const allTypes = [...new Set(signals.map((s) => s.signal_type))];

  const getSignalTime = (signal: Signal) => {
    const dateStr = signal.created_at || signal.scanned_at;
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString();
  };

  return (
    <div className="mx-auto max-w-[1000px] px-3.5 py-6 md:p-6">
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

      <div className="mb-5 grid grid-cols-3 gap-2 md:gap-2.5">
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
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2.5 md:px-4 md:py-3.5"
            style={{ borderTop: `2px solid ${card.color}` }}
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

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible [-webkit-overflow-scrolling:touch]">
        <div className="mr-1 flex shrink-0 items-center font-mono text-[9px] tracking-wider text-text-secondary">
          STRENGTH:
        </div>
        {(['all', 'high', 'medium', 'low'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="shrink-0 cursor-pointer rounded-full border px-3 py-1 font-mono text-[9px] tracking-wide"
            style={{
              borderColor: filter === f ? '#00ff8840' : '#1e2a3a',
              background: filter === f ? '#00ff8815' : '#111620',
              color: filter === f ? '#00ff88' : '#7a8fa8',
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <div className="ml-2 mr-1 flex shrink-0 items-center font-mono text-[9px] tracking-wider text-text-secondary">
          TYPE:
        </div>
        <button
          onClick={() => setTypeFilter('all')}
          className="shrink-0 cursor-pointer rounded-full border px-3 py-1 font-mono text-[9px] tracking-wide"
          style={{
            borderColor: typeFilter === 'all' ? '#3d9aff40' : '#1e2a3a',
            background: typeFilter === 'all' ? '#3d9aff15' : '#111620',
            color: typeFilter === 'all' ? '#3d9aff' : '#7a8fa8',
          }}
        >
          ALL
        </button>
        {allTypes.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className="shrink-0 cursor-pointer rounded-full border px-3 py-1 font-mono text-[9px] tracking-wide"
            style={{
              borderColor: typeFilter === t ? '#3d9aff40' : '#1e2a3a',
              background: typeFilter === t ? '#3d9aff15' : '#111620',
              color: typeFilter === t ? '#3d9aff' : '#7a8fa8',
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
        <>
        {tradeSuccess && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              background: '#00ff8815',
              border: '1px solid #00ff8840',
              borderRadius: 8,
              color: '#00ff88',
              fontFamily: 'monospace',
              fontSize: 11,
              letterSpacing: 1,
            }}
          >
            {tradeSuccess}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredSignals.map((signal) => {
            const sc = STRENGTH_COLORS[signal.strength];
            const isExpanded = expandedId === signal.id;
            const signalTime = getSignalTime(signal);
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
                  className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-3.5 md:px-4 md:py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-base font-bold text-accent-yellow md:text-[15px]">
                        {signal.ticker}
                      </span>
                      <span className="font-mono text-[9px] text-text-secondary">
                        {(SIGNAL_TYPE_LABELS[signal.signal_type] || signal.signal_type).toUpperCase()}
                      </span>
                    </div>
                    <span
                      className="mt-1 hidden font-mono text-[9px] md:inline"
                      style={{ color: STATUS_COLORS[signal.status] || '#7a8fa8' }}
                    >
                      {signal.status?.toUpperCase()}
                      {signalTime ? ` · ${signalTime}` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
                      style={{
                        background: sc.bg,
                        color: sc.text,
                        borderColor: sc.border,
                      }}
                    >
                      {signal.strength.toUpperCase()}
                    </span>
                    <span className="text-xs text-text-muted md:hidden">{isExpanded ? '▲' : '▼'}</span>
                  </div>
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
                    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-2">
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
                      <button
                        onClick={() => openTradeModal(signal)}
                        style={{
                          padding: '6px 14px',
                          background: '#00ff8820',
                          border: '1px solid #00ff8860',
                          borderRadius: 8,
                          color: '#00ff88',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        ◆ EXECUTE TRADE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}

      <TradeModal
        isOpen={tradeModalOpen}
        onClose={() => {
          setTradeModalOpen(false);
          setTradeSignal(null);
          setTradeError(null);
        }}
        onConfirm={executeTrade}
        ticker={tradeSignal?.ticker || ''}
        side="buy"
        suggestedPlay={tradeSignal?.signal_type}
        signalStrength={tradeSignal?.strength}
        loading={tradeLoading}
        error={tradeError}
      />
    </div>
  );
}
