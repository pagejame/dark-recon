'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface PriceAlert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  current_price?: number;
  status: 'active' | 'triggered' | 'dismissed';
  note?: string;
  triggered_at?: string;
  created_at: string;
}

function formatMoney(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getProgress(alert: PriceAlert) {
  if (!alert.current_price) return 0;
  if (alert.condition === 'above') {
    const range = alert.target_price - alert.current_price * 0.9;
    const progress = (alert.current_price - alert.current_price * 0.9) / range;
    return Math.min(100, Math.max(0, progress * 100));
  }
  const range = alert.current_price * 1.1 - alert.target_price;
  const progress = (alert.current_price * 1.1 - alert.current_price) / range;
  return Math.min(100, Math.max(0, progress * 100));
}

function getDistance(alert: PriceAlert) {
  if (!alert.current_price) return null;
  const points =
    alert.condition === 'above'
      ? alert.target_price - alert.current_price
      : alert.current_price - alert.target_price;
  const pct = (Math.abs(points) / alert.target_price) * 100;
  return { points: Math.abs(points), pct };
}

function timeAgo(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [alertTicker, setAlertTicker] = useState('');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertPrice, setAlertPrice] = useState('');
  const [alertNote, setAlertNote] = useState('');
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (e) {
      console.error('Fetch alerts error:', e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAllAlerts = useCallback(async () => {
    setChecking(true);
    try {
      await fetch('/api/alerts/check');
      setLastChecked(new Date());
      await fetchAlerts();
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  }, [fetchAlerts]);

  useEffect(() => {
    const init = async () => {
      await checkAllAlerts();
    };
    void init();
  }, [checkAllAlerts]);

  useEffect(() => {
    const onPullRefresh = () => {
      void checkAllAlerts();
    };
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [checkAllAlerts]);

  const handleSetAlert = async () => {
    const ticker = alertTicker.trim().toUpperCase();
    const price = parseFloat(alertPrice);

    if (!ticker || !alertPrice || isNaN(price) || price <= 0) {
      setAlertError('Please enter a valid ticker and price');
      return;
    }

    setAlertSaving(true);
    setAlertError(null);
    setAlertSuccess(null);

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          condition: alertCondition,
          target_price: price,
          note: alertNote.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create alert');
      }

      setAlertSuccess(`Alert set — ${ticker} ${alertCondition} $${price.toFixed(2)}`);
      setAlertTicker('');
      setAlertPrice('');
      setAlertNote('');

      await fetchAlerts();

      setTimeout(() => setAlertSuccess(null), 3000);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create alert';
      console.error('Set alert error:', e);
      setAlertError(message);
    } finally {
      setAlertSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    await fetchAlerts();
  };

  const handleDismiss = async (id: string) => {
    await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    await fetchAlerts();
  };

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const triggeredAlerts = alerts.filter((a) => a.status === 'triggered');
  const dismissedAlerts = alerts.filter((a) => a.status === 'dismissed').slice(0, 10);

  const accentColor = (c: 'above' | 'below') => (c === 'above' ? '#00ff88' : '#ff3d5a');

  return (
    <div className="dr-page dr-page-narrow">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 24,
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
            Price Alerts
          </h1>
          <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
            Get notified when tickers hit your targets
          </div>
          {lastChecked && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#3d5068',
                marginTop: 6,
              }}
            >
              Last checked: {timeAgo(lastChecked)}
            </div>
          )}
        </div>
        <button
          onClick={() => checkAllAlerts()}
          disabled={checking}
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 2,
            color: '#ffd700',
            background: '#ffd70015',
            border: '1px solid #ffd70040',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: checking ? 'wait' : 'pointer',
            opacity: checking ? 0.6 : 1,
          }}
        >
          {checking ? 'CHECKING…' : 'CHECK ALL ALERTS'}
        </button>
      </div>

      {/* Add Alert Card */}
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderLeft: '3px solid #3d9aff',
          borderRadius: 10,
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#3d9aff',
            marginBottom: 16,
          }}
        >
          SET NEW ALERT
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            placeholder="TICKER"
            value={alertTicker}
            onChange={(e) => setAlertTicker(e.target.value.toUpperCase())}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              color: '#ffd700',
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 6,
              padding: '10px 12px',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['above', 'below'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAlertCondition(c)}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 1,
                  color: alertCondition === c ? accentColor(c) : '#7a8fa8',
                  background: alertCondition === c ? `${accentColor(c)}15` : '#0d1117',
                  border: `1px solid ${alertCondition === c ? `${accentColor(c)}40` : '#1e2a3a'}`,
                  borderRadius: 6,
                  padding: '10px 8px',
                  cursor: 'pointer',
                }}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="0.01"
            placeholder="Target price"
            value={alertPrice}
            onChange={(e) => setAlertPrice(e.target.value)}
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: '#e8edf5',
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 6,
              padding: '10px 12px',
              outline: 'none',
            }}
          />
          <input
            type="text"
            placeholder="e.g. NVDA breakout level"
            value={alertNote}
            onChange={(e) => setAlertNote(e.target.value)}
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#7a8fa8',
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 6,
              padding: '10px 12px',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={handleSetAlert}
            disabled={alertSaving || !alertTicker || !alertPrice}
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              color: '#00ff88',
              background: '#00ff8815',
              border: '1px solid #00ff8840',
              padding: '10px 20px',
              borderRadius: 6,
              cursor: alertSaving ? 'wait' : 'pointer',
              opacity: !alertTicker || !alertPrice ? 0.5 : 1,
            }}
          >
            {alertSaving ? 'SETTING…' : 'SET ALERT'}
          </button>
        </div>
        {alertError && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: '#ff3d5a10',
              border: '1px solid #ff3d5a40',
              borderRadius: 8,
              color: '#ff8fa0',
              fontSize: 13,
            }}
          >
            {alertError}
          </div>
        )}
        {alertSuccess && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: '#00ff8810',
              border: '1px solid #00ff8840',
              borderRadius: 8,
              color: '#00ff88',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          >
            ✓ {alertSuccess}
          </div>
        )}
      </div>

      {/* Triggered Alerts */}
      {triggeredAlerts.length > 0 && (
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
            TRIGGERED ({triggeredAlerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {triggeredAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  background: '#ffd70010',
                  border: '1px solid #ffd70040',
                  borderLeft: '3px solid #ffd700',
                  borderRadius: 10,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 20,
                      fontWeight: 700,
                      color: '#ffd700',
                    }}
                  >
                    {alert.ticker}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#e8edf5' }}>
                    {alert.condition === 'above' ? 'went above' : 'went below'}{' '}
                    {formatMoney(alert.target_price)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: '#7a8fa8',
                    marginTop: 6,
                  }}
                >
                  Triggered at {formatMoney(alert.current_price || alert.target_price)}
                  {alert.triggered_at &&
                    ` on ${new Date(alert.triggered_at).toLocaleDateString()} at ${new Date(alert.triggered_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      letterSpacing: 1,
                      color: '#7a8fa8',
                      background: '#7a8fa815',
                      border: '1px solid #7a8fa840',
                      padding: '6px 14px',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    DISMISS
                  </button>
                  <Link
                    href={`/thesis?ticker=${alert.ticker}`}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      letterSpacing: 1,
                      color: '#3d9aff',
                      background: '#3d9aff15',
                      border: '1px solid #3d9aff40',
                      padding: '6px 14px',
                      borderRadius: 6,
                      textDecoration: 'none',
                    }}
                  >
                    BUILD THESIS →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Alerts */}
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
          ACTIVE ALERTS ({activeAlerts.length})
        </div>
        {loading ? (
          <div style={{ color: '#7a8fa8', fontFamily: 'monospace', fontSize: 11 }}>Loading…</div>
        ) : activeAlerts.length === 0 ? (
          <div
            style={{
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderRadius: 10,
              padding: 32,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#7a8fa8',
            }}
          >
            No active alerts — set one above
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeAlerts.map((alert) => {
              const color = accentColor(alert.condition);
              const progress = getProgress(alert);
              const distance = getDistance(alert);
              return (
                <div
                  key={alert.id}
                  style={{
                    background: '#111620',
                    border: '1px solid #1e2a3a',
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 10,
                    padding: '16px 20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 22,
                          fontWeight: 700,
                          color: '#ffd700',
                          marginBottom: 4,
                        }}
                      >
                        {alert.ticker}
                      </div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 10,
                          letterSpacing: 1,
                          color: '#7a8fa8',
                        }}
                      >
                        WHEN {alert.ticker} GOES {alert.condition.toUpperCase()}{' '}
                        {formatMoney(alert.target_price)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(alert.id)}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 14,
                        color: '#3d5068',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 8px',
                      }}
                      aria-label="Delete alert"
                    >
                      ✕
                    </button>
                  </div>

                  {alert.current_price != null && (
                    <>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 13,
                          color: '#e8edf5',
                          marginTop: 12,
                          marginBottom: 8,
                        }}
                      >
                        {formatMoney(alert.current_price)} → {formatMoney(alert.target_price)}
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: '#1e2a3a',
                          borderRadius: 3,
                          overflow: 'hidden',
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: color,
                            borderRadius: 3,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      {distance && (
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 9,
                            color: '#3d5068',
                          }}
                        >
                          {distance.points.toFixed(2)} points away ({distance.pct.toFixed(1)}%)
                        </div>
                      )}
                    </>
                  )}

                  {alert.note && (
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 10,
                        color: '#7a8fa8',
                        marginTop: 8,
                        fontStyle: 'italic',
                      }}
                    >
                      {alert.note}
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => checkAllAlerts()}
                      disabled={checking}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 9,
                        letterSpacing: 1,
                        color: color,
                        background: `${color}15`,
                        border: `1px solid ${color}40`,
                        padding: '6px 14px',
                        borderRadius: 6,
                        cursor: checking ? 'wait' : 'pointer',
                      }}
                    >
                      CHECK NOW
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#7a8fa8',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            marginBottom: showHistory ? 12 : 0,
            padding: 0,
          }}
        >
          HISTORY {showHistory ? '▲' : '▼'}
        </button>
        {showHistory && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dismissedAlerts.length === 0 ? (
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
                No dismissed alerts
              </div>
            ) : (
              dismissedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#ffd700',
                        marginRight: 8,
                      }}
                    >
                      {alert.ticker}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
                      {alert.condition} {formatMoney(alert.target_price)}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                    {new Date(alert.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
