'use client';

import { useState, useEffect, useCallback } from 'react';

interface OptionsContract {
  symbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  open_interest: number;
  implied_volatility: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  in_the_money: boolean;
  intrinsic_value: number;
  time_value: number;
  days_to_expiry: number;
}

interface OptionsChainResult {
  underlying: string;
  current_price: number | null;
  contracts: OptionsContract[];
  expirations: string[];
  strikes: number[];
  fetched_at: string;
  cache?: string;
}

interface OptionsChainProps {
  ticker: string;
  suggestedStrike?: number;
  suggestedExpiry?: string;
  suggestedType?: 'call' | 'put';
  onExecute?: (contract: OptionsContract, qty: number) => void;
}

function GreekBadge({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const color = label === 'θ' ? '#ff3d5a' : label === 'Δ' ? '#00ff88' : '#3d9aff';
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#0d1117',
        border: '1px solid #1e2a3a',
        borderRadius: 6,
        padding: '3px 8px',
        minWidth: 44,
      }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#7a8fa8', letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color, fontWeight: 700 }}>
        {value.toFixed(2)}
      </span>
    </span>
  );
}

function IVBar({ iv }: { iv: number }) {
  const color = iv > 80 ? '#ff3d5a' : iv > 50 ? '#ffd700' : '#00ff88';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 50,
          height: 4,
          background: '#1e2a3a',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, iv)}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 10, color }}>{iv.toFixed(0)}%</span>
    </div>
  );
}

export default function OptionsChain({
  ticker,
  suggestedStrike,
  suggestedExpiry,
  suggestedType = 'call',
  onExecute,
}: OptionsChainProps) {
  const [chain, setChain] = useState<OptionsChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>(suggestedExpiry || '');
  const [selectedType, setSelectedType] = useState<'call' | 'put'>(suggestedType);
  const [selectedContract, setSelectedContract] = useState<OptionsContract | null>(null);
  const [orderQty, setOrderQty] = useState(1);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [limitPrice, setLimitPrice] = useState('');
  const [executing, setExecuting] = useState(false);
  const [orderResult, setOrderResult] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const fetchChain = useCallback(
    async (expiry?: string, type?: 'call' | 'put') => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ ticker });
        if (type || selectedType) params.set('type', type || selectedType);
        if (expiry || selectedExpiry) params.set('expiration', expiry || selectedExpiry);

        const res = await fetch(`/api/options/chain?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load options chain');

        setChain(data);

        if (!selectedExpiry && data.expirations?.length > 0) {
          setSelectedExpiry(data.expirations[0]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load options chain');
      } finally {
        setLoading(false);
      }
    },
    [ticker, selectedExpiry, selectedType]
  );

  useEffect(() => {
    fetchChain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    setSelectedType(suggestedType);
  }, [suggestedType]);

  const handleExpiryChange = (expiry: string) => {
    setSelectedExpiry(expiry);
    setSelectedContract(null);
    fetchChain(expiry, selectedType);
  };

  const handleTypeChange = (type: 'call' | 'put') => {
    setSelectedType(type);
    setSelectedContract(null);
    fetchChain(selectedExpiry, type);
  };

  const handleExecute = async () => {
    if (!selectedContract) return;

    if (onExecute) {
      onExecute(selectedContract, orderQty);
      return;
    }

    setExecuting(true);
    setOrderError(null);
    setOrderResult(null);

    try {
      const body: Record<string, unknown> = {
        symbol: selectedContract.symbol,
        qty: orderQty,
        side: 'buy',
        type: orderType,
      };

      if (orderType === 'limit' && limitPrice) {
        body.limit_price = parseFloat(limitPrice);
      }

      const res = await fetch('/api/options/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Order failed');

      setOrderResult(
        `✓ Order submitted — ${orderQty} contract${orderQty > 1 ? 's' : ''} of ${selectedContract.symbol}`
      );
      setSelectedContract(null);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setExecuting(false);
    }
  };

  const displayContracts = (chain?.contracts || []).filter((c) => {
    if (selectedExpiry && c.expiration !== selectedExpiry) return false;
    return true;
  });

  const isSuggested = (c: OptionsContract) =>
    suggestedStrike &&
    Math.abs(c.strike - suggestedStrike) < 5 &&
    (!suggestedExpiry || c.expiration === suggestedExpiry);

  const currentPrice = chain?.current_price || 0;

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#00ff88',
              marginBottom: 4,
            }}
          >
            OPTIONS CHAIN
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#ffd700' }}>
              {ticker}
            </span>
            {currentPrice > 0 && (
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#7a8fa8' }}>
                Stock: <span style={{ color: '#e8edf5' }}>${currentPrice.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => fetchChain(selectedExpiry, selectedType)}
          disabled={loading}
          style={{
            padding: '6px 14px',
            background: '#111620',
            border: '1px solid #1e2a3a',
            borderRadius: 8,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 2,
            cursor: 'pointer',
          }}
        >
          {loading ? 'LOADING...' : '↻ REFRESH'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['call', 'put'] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            style={{
              padding: '6px 20px',
              borderRadius: 8,
              border: `1px solid ${selectedType === t ? (t === 'call' ? '#00ff88' : '#ff3d5a') : '#1e2a3a'}`,
              background:
                selectedType === t ? (t === 'call' ? '#00ff8815' : '#ff3d5a15') : '#111620',
              color: selectedType === t ? (t === 'call' ? '#00ff88' : '#ff3d5a') : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.toUpperCase()}S
          </button>
        ))}
      </div>

      {chain?.expirations && chain.expirations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: '#7a8fa8',
              marginBottom: 8,
            }}
          >
            EXPIRATION DATE
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chain.expirations.map((exp) => {
              const date = new Date(exp);
              const daysOut = Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const isSuggestedExpiry = suggestedExpiry && exp === suggestedExpiry;
              return (
                <button
                  key={exp}
                  onClick={() => handleExpiryChange(exp)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: `1px solid ${selectedExpiry === exp ? '#3d9aff' : isSuggestedExpiry ? '#ffd70060' : '#1e2a3a'}`,
                    background: selectedExpiry === exp ? '#3d9aff15' : '#111620',
                    color: selectedExpiry === exp ? '#3d9aff' : '#7a8fa8',
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: 'pointer',
                  }}
                >
                  {exp} <span style={{ color: '#3d5068' }}>({daysOut}d)</span>
                  {isSuggestedExpiry && (
                    <span style={{ marginLeft: 4, color: '#ffd700', fontSize: 8 }}>★</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            background: '#ff3d5a10',
            border: '1px solid #ff3d5a40',
            borderRadius: 8,
            color: '#ff8fa0',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
          {error.includes('429') && ' — Rate limit hit. Wait 30 seconds and refresh.'}
          {error.includes('403') &&
            ' — Options data requires Alpaca paper account with options enabled.'}
        </div>
      )}

      {loading && !chain && (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          FETCHING OPTIONS CHAIN...
        </div>
      )}

      {!loading && displayContracts.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0d1117', borderBottom: '1px solid #1e2a3a' }}>
                {[
                  'STRIKE',
                  'BID',
                  'ASK',
                  'MID',
                  'IV',
                  'Δ DELTA',
                  'θ THETA',
                  'VOL',
                  'OI',
                  'DTE',
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 10px',
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 2,
                      color: '#7a8fa8',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayContracts.map((contract) => {
                const isSelected = selectedContract?.symbol === contract.symbol;
                const isSuggestedRow = isSuggested(contract);
                const itm = contract.in_the_money;

                return (
                  <tr
                    key={contract.symbol}
                    onClick={() => {
                      setSelectedContract(isSelected ? null : contract);
                      if (!isSelected && contract.mid > 0) {
                        setLimitPrice(contract.mid.toFixed(2));
                      }
                    }}
                    style={{
                      background: isSelected
                        ? '#3d9aff15'
                        : isSuggestedRow
                          ? '#ffd70008'
                          : itm
                            ? '#00ff8806'
                            : 'transparent',
                      borderBottom: '1px solid #1e2a3a',
                      cursor: 'pointer',
                      borderLeft: isSuggestedRow
                        ? '2px solid #ffd700'
                        : isSelected
                          ? '2px solid #3d9aff'
                          : '2px solid transparent',
                    }}
                  >
                    <td
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: itm ? '#00ff88' : '#e8edf5',
                      }}
                    >
                      ${contract.strike.toFixed(0)}
                      {isSuggestedRow && (
                        <span style={{ marginLeft: 4, color: '#ffd700', fontSize: 9 }}>★</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#7a8fa8' }}>
                      ${contract.bid.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#7a8fa8' }}>
                      ${contract.ask.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: '#e8edf5',
                      }}
                    >
                      ${contract.mid.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <IVBar iv={contract.implied_volatility} />
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        color: contract.delta && contract.delta > 0.5 ? '#00ff88' : '#7a8fa8',
                      }}
                    >
                      {contract.delta?.toFixed(2) ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        color: '#ff3d5a',
                      }}
                    >
                      {contract.theta?.toFixed(3) ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#7a8fa8' }}>
                      {contract.volume.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#7a8fa8' }}>
                      {contract.open_interest.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        color:
                          contract.days_to_expiry < 14
                            ? '#ff3d5a'
                            : contract.days_to_expiry < 30
                              ? '#ffd700'
                              : '#7a8fa8',
                      }}
                    >
                      {contract.days_to_expiry}d
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedContract(contract);
                          setLimitPrice(contract.mid.toFixed(2));
                        }}
                        style={{
                          padding: '4px 10px',
                          background: '#00ff8815',
                          border: '1px solid #00ff8840',
                          borderRadius: 6,
                          color: '#00ff88',
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 1,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        BUY
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && displayContracts.length === 0 && chain && (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          NO CONTRACTS FOUND — TRY DIFFERENT EXPIRATION
        </div>
      )}

      {selectedContract && (
        <div
          style={{
            marginTop: 16,
            background: '#111620',
            border: '1px solid #3d9aff',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#3d9aff',
              marginBottom: 12,
            }}
          >
            EXECUTE ORDER
          </div>

          <div
            style={{
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 14,
                fontWeight: 700,
                color: '#ffd700',
                marginBottom: 4,
              }}
            >
              {selectedContract.underlying} ${selectedContract.strike}{' '}
              {selectedContract.type.toUpperCase()}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#7a8fa8',
                marginBottom: 8,
              }}
            >
              Expires {selectedContract.expiration} · {selectedContract.days_to_expiry} days · OCC:{' '}
              {selectedContract.symbol}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                Bid: <span style={{ color: '#e8edf5' }}>${selectedContract.bid.toFixed(2)}</span>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                Ask: <span style={{ color: '#e8edf5' }}>${selectedContract.ask.toFixed(2)}</span>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                Mid:{' '}
                <span style={{ color: '#00ff88', fontWeight: 700 }}>
                  ${selectedContract.mid.toFixed(2)}
                </span>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                IV:{' '}
                <span style={{ color: '#ffd700' }}>
                  {selectedContract.implied_volatility.toFixed(0)}%
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <GreekBadge label="Δ" value={selectedContract.delta} />
              <GreekBadge label="γ" value={selectedContract.gamma} />
              <GreekBadge label="θ" value={selectedContract.theta} />
              <GreekBadge label="ν" value={selectedContract.vega} />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 14,
            }}
          >
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
                CONTRACTS
              </div>
              <input
                type="number"
                min={1}
                max={100}
                value={orderQty}
                onChange={(e) => setOrderQty(parseInt(e.target.value, 10) || 1)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
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
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  color: '#3d5068',
                  marginTop: 4,
                }}
              >
                = {orderQty * 100} shares · ${(orderQty * selectedContract.mid * 100).toFixed(0)}{' '}
                total
              </div>
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
              <div style={{ display: 'flex', gap: 6 }}>
                {(['limit', 'market'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      border: `1px solid ${orderType === t ? '#3d9aff' : '#1e2a3a'}`,
                      background: orderType === t ? '#3d9aff15' : '#0d1117',
                      color: orderType === t ? '#3d9aff' : '#7a8fa8',
                      borderRadius: 8,
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
          </div>

          {orderType === 'limit' && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 2,
                  color: '#7a8fa8',
                  marginBottom: 6,
                }}
              >
                LIMIT PRICE (per contract, not per share)
              </div>
              <input
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
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
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  color: '#3d5068',
                  marginTop: 4,
                }}
              >
                Mid: ${selectedContract.mid.toFixed(2)} · Bid: ${selectedContract.bid.toFixed(2)} ·
                Ask: ${selectedContract.ask.toFixed(2)}
              </div>
            </div>
          )}

          {orderError && (
            <div
              style={{
                padding: 10,
                background: '#ff3d5a10',
                border: '1px solid #ff3d5a40',
                borderRadius: 8,
                color: '#ff8fa0',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {orderError}
            </div>
          )}

          {orderResult && (
            <div
              style={{
                padding: 10,
                background: '#00ff8810',
                border: '1px solid #00ff8840',
                borderRadius: 8,
                color: '#00ff88',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              {orderResult}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                setSelectedContract(null);
                setOrderError(null);
                setOrderResult(null);
              }}
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
              onClick={handleExecute}
              disabled={executing || (orderType === 'limit' && !limitPrice)}
              style={{
                flex: 2,
                padding: 12,
                background: executing ? '#1e2a3a' : '#00ff88',
                color: executing ? '#7a8fa8' : '#080a0f',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: executing ? 'not-allowed' : 'pointer',
              }}
            >
              {executing ? 'EXECUTING...' : `BUY ${orderQty} CONTRACT${orderQty > 1 ? 'S' : ''}`}
            </button>
          </div>
        </div>
      )}

      {chain && (
        <div
          style={{
            marginTop: 12,
            fontFamily: 'monospace',
            fontSize: 8,
            color: '#3d5068',
            letterSpacing: 1,
          }}
        >
          {displayContracts.length} contracts · Indicative feed · Updated{' '}
          {new Date(chain.fetched_at).toLocaleTimeString()} · {chain.cache || 'FRESH'}
        </div>
      )}
    </div>
  );
}
