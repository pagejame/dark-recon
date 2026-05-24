'use client';

import { useState, useEffect, useRef } from 'react';

interface TickerItem {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  is_position: boolean;
  is_index: boolean;
  is_watchlist: boolean;
}

function isMarketHours(): boolean {
  const h = new Date().getHours();
  const d = new Date().getDay();
  return d >= 1 && d <= 5 && h >= 9 && h < 16;
}

export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchTicker = async () => {
    try {
      const res = await fetch('/api/ticker');
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        setItems(data.items);
        setLoading(false);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchTicker();

    const interval = setInterval(fetchTicker, isMarketHours() ? 60000 : 300000);
    return () => clearInterval(interval);
  }, []);

  if (loading || items.length === 0) {
    return (
      <div
        style={{
          height: 32,
          background: '#080a0f',
          borderBottom: '1px solid #1e2a3a',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#3d5068',
            letterSpacing: 2,
          }}
        >
          LOADING MARKET DATA...
        </span>
      </div>
    );
  }

  const displayItems = [...items, ...items];

  return (
    <div
      style={{
        height: 32,
        background: '#080a0f',
        borderBottom: '1px solid #1e2a3a',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 40,
          background: 'linear-gradient(to right, #080a0f, transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 40,
          background: 'linear-gradient(to left, #080a0f, transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          animation: 'ticker-scroll 60s linear infinite',
          whiteSpace: 'nowrap',
        }}
      >
        {displayItems.map((item, index) => {
          const isPositive = item.change_pct >= 0;
          const color = isPositive ? '#00ff88' : '#ff3d5a';
          const arrow = isPositive ? '▲' : '▼';

          return (
            <span
              key={`${item.ticker}-${index}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 20px',
                borderRight: '1px solid #1e2a3a',
              }}
            >
              {item.is_position && !item.is_index && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#ffd700',
                    flexShrink: 0,
                  }}
                />
              )}
              {item.is_watchlist && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#3d9aff',
                    flexShrink: 0,
                  }}
                />
              )}

              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color:
                    item.is_position && !item.is_index
                      ? '#ffd700'
                      : item.is_watchlist
                        ? '#3d9aff'
                        : '#7a8fa8',
                }}
              >
                {item.ticker}
              </span>

              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#e8edf5',
                }}
              >
                ${item.price.toFixed(2)}
              </span>

              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                {arrow} {isPositive ? '+' : ''}
                {item.change_pct.toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
