'use client';

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import PerformanceChart from '@/components/portfolio/PerformanceChart';

interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  last_equity: string;
  daytrading_buying_power?: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  side: string;
  qty: string;
  type: string;
  status: string;
  filled_avg_price: string | null;
  created_at: string;
}

interface StopLossAuditRow {
  ticker: string;
  has_stop: boolean;
  message: string;
}

interface CorrelationAlertRow {
  message: string;
  recommendation: string;
  risk_level: string;
}

function Skeleton({ width = '100%', height = 20 }: { width?: string | number; height?: number }) {
  return (
    <div
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, #1e2a3a 25%, #2a3a4a 50%, #1e2a3a 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: 6,
      }}
    />
  );
}

function formatMoney(val: string | number) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatPct(val: string) {
  const n = parseFloat(val) * 100;
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function PortfolioPage() {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [orders, setOrders] = useState<AlpacaOrder[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [auditResults, setAuditResults] = useState<StopLossAuditRow[]>([]);
  const [correlationAlerts, setCorrelationAlerts] = useState<CorrelationAlertRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [allProtected, setAllProtected] = useState<boolean | null>(null);

  const fetchAccount = useCallback(async () => {
    setAccountLoading(true);
    setAccountError(null);
    try {
      const res = await fetch('/api/trading/account');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load account');
      setAccount(data);
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : 'Failed to load account');
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true);
    try {
      const res = await fetch('/api/trading/positions');
      const data = await res.json();
      setPositions(data.positions || []);
    } catch {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/trading/orders');
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const runProtectionAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const [auditRes, corrRes] = await Promise.all([
        fetch('/api/portfolio/audit'),
        fetch('/api/portfolio/correlation'),
      ]);
      const auditData = await auditRes.json();
      const corrData = await corrRes.json();
      setAuditResults(auditData.results || []);
      setAllProtected(auditData.all_protected ?? null);
      setCorrelationAlerts(corrData.alerts || []);
      setAuditLoaded(true);
    } catch {
      setAuditResults([]);
      setCorrelationAlerts([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
    fetchPositions();
    fetchOrders();
    runProtectionAudit();
  }, [fetchAccount, fetchPositions, fetchOrders, runProtectionAudit]);

  useEffect(() => {
    const onPullRefresh = () => {
      fetchAccount();
      fetchPositions();
      fetchOrders();
    };
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [fetchAccount, fetchPositions, fetchOrders]);

  const dayPnl = account
    ? parseFloat(account.equity) - parseFloat(account.last_equity)
    : 0;
  const totalPnl = account
    ? parseFloat(account.equity) - parseFloat(account.portfolio_value || account.equity)
    : 0;

  const handleClose = async (symbol: string) => {
    if (closeConfirm !== symbol) {
      setCloseConfirm(symbol);
      return;
    }
    setClosing(symbol);
    try {
      await fetch('/api/trading/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      setCloseConfirm(null);
      fetchPositions();
      fetchAccount();
      fetchOrders();
    } catch {
      // silent
    } finally {
      setClosing(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId);
    try {
      await fetch(`/api/trading/orders/${orderId}`, { method: 'DELETE' });
      fetchOrders();
    } catch {
      // silent
    } finally {
      setCancelling(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'filled') return '#00ff88';
    if (status === 'canceled' || status === 'cancelled') return '#ff3d5a';
    return '#ffd700';
  };

  const thStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 2,
    color: '#7a8fa8',
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '1px solid #1e2a3a',
    fontWeight: 400,
  };

  const tdStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#e8edf5',
    padding: '12px',
    borderBottom: '1px solid #1e2a3a20',
  };

  return (
    <div className="mx-auto max-w-[1100px] px-3.5 py-6 md:p-6">
      <div style={{ marginBottom: 24 }}>
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
          Portfolio
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Alpaca paper trading account
        </div>
      </div>

      <PerformanceChart />

      {/* Account Overview */}
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderLeft: '3px solid #00ff88',
          borderRadius: 10,
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 8,
            letterSpacing: 3,
            color: '#7a8fa8',
            marginBottom: 16,
          }}
        >
          PAPER TRADING ACCOUNT
        </div>

        {accountLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 20 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i}>
                <Skeleton height={10} width={80} />
                <div style={{ marginTop: 8 }}>
                  <Skeleton height={24} />
                </div>
              </div>
            ))}
          </div>
        ) : accountError ? (
          <div style={{ color: '#ff8fa0', fontSize: 13 }}>{accountError}</div>
        ) : account ? (
          <>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 36,
                fontWeight: 700,
                color: '#e8edf5',
                marginBottom: 20,
              }}
            >
              {formatMoney(account.equity)}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 16,
              }}
            >
              {[
                { label: 'CASH', value: formatMoney(account.cash) },
                {
                  label: 'DAY P&L',
                  value: formatMoney(dayPnl),
                  color: dayPnl >= 0 ? '#00ff88' : '#ff3d5a',
                },
                {
                  label: 'TOTAL P&L',
                  value: formatMoney(totalPnl),
                  color: totalPnl >= 0 ? '#00ff88' : '#ff3d5a',
                },
                { label: 'BUYING POWER', value: formatMoney(account.buying_power) },
              ].map((stat) => (
                <div key={stat.label}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 2,
                      color: '#7a8fa8',
                      marginBottom: 4,
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 16,
                      fontWeight: 700,
                      color: stat.color || '#e8edf5',
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Position Protection Audit */}
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderLeft: '3px solid #00ff88',
          borderRadius: 10,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 3,
                color: '#00ff88',
              }}
            >
              POSITION PROTECTION AUDIT
            </div>
            {allProtected === true && auditLoaded && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 1,
                  color: '#00ff88',
                  background: '#00ff8815',
                  border: '1px solid #00ff8840',
                  padding: '2px 8px',
                  borderRadius: 20,
                }}
              >
                ALL PROTECTED
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => runProtectionAudit()}
            disabled={auditLoading}
            style={{
              padding: '6px 14px',
              background: auditLoading ? '#1e2a3a' : '#00ff8815',
              border: '1px solid #00ff8840',
              borderRadius: 6,
              color: '#00ff88',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              cursor: auditLoading ? 'wait' : 'pointer',
            }}
          >
            {auditLoading ? 'RUNNING...' : 'RUN AUDIT'}
          </button>
        </div>

        {auditLoading && !auditLoaded ? (
          <div style={{ padding: '8px 0' }}>
            <Skeleton height={24} />
            <Skeleton height={24} />
          </div>
        ) : auditResults.length === 0 ? (
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
            No open positions to audit
          </div>
        ) : (
          auditResults.map((result) => (
            <div
              key={result.ticker}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 0',
                borderBottom: '1px solid #0d1117',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontFamily: 'monospace', color: '#ffd700', fontWeight: 700 }}>
                {result.ticker}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: result.has_stop ? '#00ff88' : '#ff3d5a',
                  textAlign: 'right',
                  flex: 1,
                }}
              >
                {result.message}
              </span>
            </div>
          ))
        )}

        {correlationAlerts.map((alert, i) => (
          <div
            key={i}
            style={{
              marginTop: 12,
              padding: 10,
              background: alert.risk_level === 'high' ? '#ff3d5a10' : '#ffd70010',
              border: `1px solid ${alert.risk_level === 'high' ? '#ff3d5a30' : '#ffd70030'}`,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: alert.risk_level === 'high' ? '#ff3d5a' : '#ffd700',
                marginBottom: 4,
              }}
            >
              CORRELATION WARNING
            </div>
            <div style={{ fontSize: 13, color: '#e8edf5', marginBottom: 4 }}>{alert.message}</div>
            <div style={{ fontSize: 11, color: '#7a8fa8' }}>{alert.recommendation}</div>
          </div>
        ))}
      </div>

      {/* Open Positions */}
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 10,
          marginBottom: 24,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e2a3a',
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#3d9aff',
          }}
        >
          OPEN POSITIONS
        </div>
        {positionsLoading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={32} />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 11,
              letterSpacing: 2,
              color: '#7a8fa8',
            }}
          >
            No open positions — confirmed signals will appear here
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['SYMBOL', 'QTY', 'ENTRY', 'CURRENT', 'MKT VALUE', 'P&L ($)', 'P&L (%)', ''].map(
                    (h) => (
                      <th key={h} style={thStyle}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const pl = parseFloat(pos.unrealized_pl);
                  const plColor = pl >= 0 ? '#00ff88' : '#ff3d5a';
                  return (
                    <tr key={pos.symbol}>
                      <td style={{ ...tdStyle, color: '#ffd700', fontWeight: 700 }}>
                        {pos.symbol}
                      </td>
                      <td style={tdStyle}>{pos.qty}</td>
                      <td style={tdStyle}>{formatMoney(pos.avg_entry_price)}</td>
                      <td style={tdStyle}>{formatMoney(pos.current_price)}</td>
                      <td style={tdStyle}>{formatMoney(pos.market_value)}</td>
                      <td style={{ ...tdStyle, color: plColor }}>{formatMoney(pl)}</td>
                      <td style={{ ...tdStyle, color: plColor }}>
                        {formatPct(pos.unrealized_plpc)}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => handleClose(pos.symbol)}
                          disabled={closing === pos.symbol}
                          style={{
                            padding: '4px 10px',
                            background: closeConfirm === pos.symbol ? '#ff3d5a' : '#ff3d5a15',
                            border: '1px solid #ff3d5a40',
                            borderRadius: 6,
                            color: closeConfirm === pos.symbol ? '#080a0f' : '#ff3d5a',
                            fontFamily: 'monospace',
                            fontSize: 8,
                            letterSpacing: 1,
                            cursor: closing === pos.symbol ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {closing === pos.symbol
                            ? 'CLOSING...'
                            : closeConfirm === pos.symbol
                              ? `Close ${pos.symbol}?`
                              : 'CLOSE'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Orders */}
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e2a3a',
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#ffd700',
          }}
        >
          RECENT ORDERS
        </div>
        {ordersLoading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={32} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 11,
              letterSpacing: 2,
              color: '#7a8fa8',
            }}
          >
            No recent orders
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['SYMBOL', 'SIDE', 'QTY', 'TYPE', 'STATUS', 'FILLED', 'TIME', ''].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isPending = ['new', 'accepted', 'pending_new', 'partially_filled'].includes(
                    order.status
                  );
                  return (
                    <tr key={order.id}>
                      <td style={{ ...tdStyle, color: '#ffd700', fontWeight: 700 }}>
                        {order.symbol}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: order.side === 'buy' ? '#00ff88' : '#ff3d5a',
                          fontWeight: 700,
                        }}
                      >
                        {order.side.toUpperCase()}
                      </td>
                      <td style={tdStyle}>{order.qty}</td>
                      <td style={tdStyle}>{order.type.toUpperCase()}</td>
                      <td style={{ ...tdStyle, color: statusColor(order.status) }}>
                        {order.status.toUpperCase()}
                      </td>
                      <td style={tdStyle}>
                        {order.filled_avg_price ? formatMoney(order.filled_avg_price) : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: '#7a8fa8', fontSize: 10 }}>
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                      <td style={tdStyle}>
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleCancel(order.id)}
                            disabled={cancelling === order.id}
                            style={{
                              padding: '4px 10px',
                              background: '#ffd70015',
                              border: '1px solid #ffd70040',
                              borderRadius: 6,
                              color: '#ffd700',
                              fontFamily: 'monospace',
                              fontSize: 8,
                              letterSpacing: 1,
                              cursor: cancelling === order.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {cancelling === order.id ? '...' : 'CANCEL'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
