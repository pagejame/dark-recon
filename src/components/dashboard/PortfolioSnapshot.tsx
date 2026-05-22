'use client';

import Link from 'next/link';

interface AlpacaPosition {
  symbol: string;
  qty: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
}

interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  last_equity: string;
}

interface PortfolioSnapshotProps {
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  loading: boolean;
}

function formatMoney(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PortfolioSnapshot({ account, positions, loading }: PortfolioSnapshotProps) {
  const equity = account ? parseFloat(account.equity) : 0;
  const dayPnl = account ? parseFloat(account.equity) - parseFloat(account.last_equity) : 0;
  const isPositive = dayPnl >= 0;

  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderLeft: '3px solid #00ff88',
        borderRadius: 10,
        padding: '20px 24px',
        height: '100%',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 3,
          color: '#7a8fa8',
          marginBottom: 12,
        }}
      >
        PAPER ACCOUNT
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="h-8 w-40 animate-pulse rounded bg-bg-elevated" />
          <div className="h-4 w-28 animate-pulse rounded bg-bg-elevated" />
          {[1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-bg-elevated" />
          ))}
        </div>
      ) : !account ? (
        <p style={{ fontSize: 13, color: '#7a8fa8' }}>Paper account unavailable</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 22,
                fontWeight: 700,
                color: '#e8edf5',
                marginBottom: 4,
              }}
            >
              {formatMoney(equity)}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: isPositive ? '#00ff88' : '#ff3d5a',
              }}
            >
              {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}
              {formatMoney(dayPnl)} today
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1e2a3a', marginBottom: 12 }} />

          {positions.length === 0 ? (
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#3d5068',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              No positions yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {positions.slice(0, 4).map((pos) => {
                const pl = parseFloat(pos.unrealized_pl);
                const plPct = parseFloat(pos.unrealized_plpc) * 100;
                const mktVal = parseFloat(pos.market_value);
                const allocPct = equity > 0 ? (mktVal / equity) * 100 : 0;
                const plColor = pl >= 0 ? '#00ff88' : '#ff3d5a';

                return (
                  <div key={pos.symbol}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontFamily: 'monospace',
                        fontSize: 11,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: '#ffd700', fontWeight: 700, minWidth: 44 }}>
                        {pos.symbol}
                      </span>
                      <span style={{ color: '#7a8fa8', minWidth: 28 }}>{pos.qty}</span>
                      <span style={{ color: plColor, minWidth: 64 }}>
                        {pl >= 0 ? '+' : ''}
                        {formatMoney(pl)}
                      </span>
                      <span style={{ color: plColor, minWidth: 48 }}>
                        {plPct >= 0 ? '+' : ''}
                        {plPct.toFixed(2)}%
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 4,
                          background: '#1e2a3a',
                          borderRadius: 2,
                          overflow: 'hidden',
                          minWidth: 40,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(allocPct, 100)}%`,
                            height: '100%',
                            background: '#3d9aff',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ borderTop: '1px solid #1e2a3a', marginBottom: 12 }} />

          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8', marginBottom: 12 }}>
            Cash: {formatMoney(parseFloat(account.cash))} · Buying Power:{' '}
            {formatMoney(parseFloat(account.buying_power))}
          </div>

          <Link
            href="/portfolio"
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              color: '#00ff88',
              textDecoration: 'none',
            }}
          >
            View Portfolio →
          </Link>
        </>
      )}
    </div>
  );
}
