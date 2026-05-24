'use client';

import Link from 'next/link';
import PortfolioHeatmap from '@/components/portfolio/PortfolioHeatmap';

interface AlpacaPosition {
  symbol: string;
  qty: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
  current_price?: string;
  avg_entry_price?: string;
}

interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  last_equity: string;
}

interface RebalanceAction {
  ticker: string;
  action: string;
  reason: string;
  urgency: string;
}

interface PortfolioSnapshotProps {
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  loading: boolean;
  rebalanceActions?: RebalanceAction[];
}

function formatMoney(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PortfolioSnapshot({
  account,
  positions,
  loading,
  rebalanceActions = [],
}: PortfolioSnapshotProps) {
  const equity = account ? parseFloat(account.equity) : 0;
  const dayPnl = account ? parseFloat(account.equity) - parseFloat(account.last_equity) : 0;
  const isPositive = dayPnl >= 0;

  const heatmapPositions = positions.map((p) => ({
    ticker: p.symbol,
    pnl_pct: parseFloat(p.unrealized_plpc || '0') * 100,
    pnl_dollar: parseFloat(p.unrealized_pl || '0'),
    market_value: parseFloat(p.market_value || '0'),
    portfolio_pct: equity > 0 ? (parseFloat(p.market_value || '0') / equity) * 100 : 0,
    current_price: parseFloat(p.current_price || '0'),
    entry_price: parseFloat(p.avg_entry_price || '0'),
  }));

  const immediateRebalance = rebalanceActions.filter((a) => a.urgency === 'immediate');

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

          <PortfolioHeatmap positions={heatmapPositions} totalEquity={equity} />

          {immediateRebalance.map((action, i) => (
            <div
              key={i}
              style={{
                marginTop: 8,
                padding: '8px 12px',
                background: '#ffd70010',
                border: '1px solid #ffd70030',
                borderRadius: 8,
                fontSize: 11,
                color: '#ffd700',
                fontFamily: 'monospace',
              }}
            >
              ⚖️ {action.ticker}: {action.reason}
            </div>
          ))}

          <div
            style={{
              borderTop: '1px solid #1e2a3a',
              marginTop: 12,
              marginBottom: 12,
              paddingTop: 12,
            }}
          />

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
