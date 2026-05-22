'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ScanResult } from '@/lib/agents/scanner';
import TradeModal from '@/components/trading/TradeModal';

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  momentum_breakout: 'MOMENTUM BREAKOUT',
  unusual_volume: 'UNUSUAL VOLUME',
  unusual_options: 'UNUSUAL OPTIONS',
  reversal_candidate: 'REVERSAL',
  sector_leader: 'SECTOR LEADER',
  insider_activity: 'INSIDER ACTIVITY',
  squeeze_candidate: 'SQUEEZE SETUP',
  earnings_catalyst: 'EARNINGS CATALYST',
};

const STRENGTH_COLORS = {
  high: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
  medium: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
  low: { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' },
};

interface TopSignalsRowProps {
  signals: ScanResult[];
  loading: boolean;
  onRunScan: () => void;
  scanning: boolean;
}

export default function TopSignalsRow({
  signals,
  loading,
  onRunScan,
  scanning,
}: TopSignalsRowProps) {
  const [tradeTicker, setTradeTicker] = useState<string | null>(null);
  const [tradeStrength, setTradeStrength] = useState<'high' | 'medium' | 'low'>('medium');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const strengthOrder = { high: 0, medium: 1, low: 2 };
  const topSignals = [...signals]
    .sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength])
    .slice(0, 3);

  const executeTrade = async (order: {
    qty: number;
    order_type: 'market' | 'limit';
    limit_price?: number;
  }) => {
    if (!tradeTicker) return;
    setTradeLoading(true);
    setTradeError(null);
    try {
      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: tradeTicker,
          qty: order.qty,
          side: 'buy',
          order_type: order.order_type,
          limit_price: order.limit_price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');
      setTradeTicker(null);
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setTradeLoading(false);
    }
  };

  return (
    <>
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 10,
          padding: '16px 20px',
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#3d9aff',
            marginBottom: 14,
          }}
        >
          TOP SIGNALS
        </div>

        {loading ? (
          <div className="flex gap-3 overflow-x-auto">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[160px] w-[280px] shrink-0 animate-pulse rounded-lg bg-bg-elevated"
              />
            ))}
          </div>
        ) : topSignals.length === 0 ? (
          <div
            style={{
              width: 280,
              height: 160,
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8', textAlign: 'center' }}>
              RUN SCAN to surface opportunities
            </span>
            <button
              type="button"
              onClick={onRunScan}
              disabled={scanning}
              style={{
                padding: '8px 16px',
                background: scanning ? '#1e2a3a' : '#00ff88',
                color: scanning ? '#7a8fa8' : '#080a0f',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: scanning ? 'not-allowed' : 'pointer',
              }}
            >
              {scanning ? 'SCANNING...' : 'RUN SCAN'}
            </button>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] md:overflow-visible">
            {topSignals.map((signal) => {
              const sc = STRENGTH_COLORS[signal.strength];
              return (
                <div
                  key={`${signal.ticker}-${signal.scanned_at}`}
                  style={{
                    width: 280,
                    minWidth: 280,
                    height: 160,
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    borderRadius: 10,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 18,
                      fontWeight: 700,
                      color: '#ffd700',
                      marginBottom: 4,
                    }}
                  >
                    {signal.ticker}
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: '#7a8fa8',
                      marginBottom: 8,
                    }}
                  >
                    {SIGNAL_TYPE_LABELS[signal.signal_type] || signal.signal_type.toUpperCase()}
                  </div>
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: sc.color,
                      background: sc.bg,
                      border: `1px solid ${sc.border}`,
                      padding: '2px 8px',
                      borderRadius: 20,
                      marginBottom: 8,
                    }}
                  >
                    ● {signal.strength.toUpperCase()}
                  </span>
                  <p
                    style={{
                      fontSize: 12,
                      color: '#7a8fa8',
                      lineHeight: 1.5,
                      flex: 1,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      marginBottom: 10,
                    }}
                  >
                    {signal.summary.length > 80 ? `${signal.summary.slice(0, 80)}…` : signal.summary}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link
                      href={`/thesis?ticker=${signal.ticker}`}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '6px 8px',
                        background: '#3d9aff15',
                        border: '1px solid #3d9aff40',
                        borderRadius: 6,
                        color: '#3d9aff',
                        fontFamily: 'monospace',
                        fontSize: 8,
                        letterSpacing: 1,
                        textDecoration: 'none',
                      }}
                    >
                      BUILD THESIS
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setTradeError(null);
                        setTradeTicker(signal.ticker);
                        setTradeStrength(signal.strength);
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        background: '#00ff8815',
                        border: '1px solid #00ff8840',
                        borderRadius: 6,
                        color: '#00ff88',
                        fontFamily: 'monospace',
                        fontSize: 8,
                        letterSpacing: 1,
                        cursor: 'pointer',
                      }}
                    >
                      EXECUTE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TradeModal
        isOpen={!!tradeTicker}
        onClose={() => {
          setTradeTicker(null);
          setTradeError(null);
        }}
        onConfirm={executeTrade}
        ticker={tradeTicker || ''}
        side="buy"
        signalStrength={tradeStrength}
        loading={tradeLoading}
        error={tradeError}
      />
    </>
  );
}
