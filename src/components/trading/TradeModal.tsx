'use client';

import { useState } from 'react';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (order: {
    qty: number;
    order_type: 'market' | 'limit';
    limit_price?: number;
  }) => void;
  ticker: string;
  side: 'buy' | 'sell';
  suggestedPlay?: string;
  loading?: boolean;
  error?: string | null;
}

export default function TradeModal({
  isOpen,
  onClose,
  onConfirm,
  ticker,
  side,
  suggestedPlay,
  loading,
  error,
}: TradeModalProps) {
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      qty,
      order_type: orderType,
      limit_price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
    });
  };

  const sideColor = side === 'buy' ? '#00ff88' : '#ff3d5a';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderTop: `3px solid ${sideColor}`,
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 420,
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: sideColor,
            marginBottom: 8,
          }}
        >
          ◆ DARK RECON — EXECUTE TRADE
        </div>
        <div
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 22,
            fontWeight: 800,
            color: '#e8edf5',
            marginBottom: 4,
          }}
        >
          {side.toUpperCase()} {ticker}
        </div>
        {suggestedPlay && (
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#7a8fa8',
              marginBottom: 20,
            }}
          >
            Suggested: {suggestedPlay}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 6,
              }}
            >
              SHARES / CONTRACTS
            </div>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: '#0d1117',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                color: '#e8edf5',
                fontFamily: 'monospace',
                fontSize: 16,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 6,
              }}
            >
              ORDER TYPE
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['market', 'limit'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    background: orderType === t ? `${sideColor}15` : '#0d1117',
                    border: `1px solid ${orderType === t ? sideColor : '#1e2a3a'}`,
                    borderRadius: 8,
                    color: orderType === t ? sideColor : '#7a8fa8',
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: 'pointer',
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {orderType === 'limit' && (
            <div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 2,
                  color: '#7a8fa8',
                  marginBottom: 6,
                }}
              >
                LIMIT PRICE
              </div>
              <input
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#0d1117',
                  border: '1px solid #1e2a3a',
                  borderRadius: 8,
                  color: '#e8edf5',
                  fontFamily: 'monospace',
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 12,
                background: '#ff3d5a10',
                border: '1px solid #ff3d5a40',
                borderRadius: 8,
                color: '#ff8fa0',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: 12,
                background: '#0d1117',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                color: '#7a8fa8',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              style={{
                flex: 2,
                padding: 12,
                background: loading ? '#1e2a3a' : sideColor,
                color: loading ? '#7a8fa8' : '#080a0f',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'EXECUTING...' : `CONFIRM ${side.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
