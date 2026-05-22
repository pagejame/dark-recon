'use client';

import { useState, useEffect } from 'react';

interface PortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
}

const PERIODS = [
  { label: '1W', value: '1W', timeframe: '1D' },
  { label: '1M', value: '1M', timeframe: '1D' },
  { label: '3M', value: '3M', timeframe: '1D' },
  { label: '1Y', value: '1A', timeframe: '1D' },
];

export default function PerformanceChart() {
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('1M');
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const selectedPeriod = PERIODS.find((x) => x.value === p) || PERIODS[1];
      const res = await fetch(
        `/api/trading/history?period=${p}&timeframe=${selectedPeriod.timeframe}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setHistory(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(period);
  }, [period]);

  const renderChart = () => {
    if (!history || !history.equity || history.equity.length < 2) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          NOT ENOUGH DATA YET — KEEP TRADING
        </div>
      );
    }

    const equities = history.equity;
    const timestamps = history.timestamp;
    const minVal = Math.min(...equities);
    const maxVal = Math.max(...equities);
    const range = maxVal - minVal || 1;
    const startVal = equities[0];
    const endVal = equities[equities.length - 1];
    const isPositive = endVal >= startVal;
    const lineColor = isPositive ? '#00ff88' : '#ff3d5a';
    const totalReturn = (((endVal - startVal) / startVal) * 100).toFixed(2);
    const totalDollar = (endVal - startVal).toFixed(2);

    const width = 800;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = equities.map((eq, i) => {
      const x = padding.left + (i / (equities.length - 1)) * chartWidth;
      const y = padding.top + ((maxVal - eq) / range) * chartHeight;
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;

    const firstX = padding.left;
    const lastX = padding.left + chartWidth;
    const baseY = padding.top + chartHeight;
    const fillD = `M ${firstX},${baseY} L ${points.join(' L ')} L ${lastX},${baseY} Z`;

    const yLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
      value: minVal + pct * range,
      y: padding.top + (1 - pct) * chartHeight,
    }));

    const xLabels = [0, Math.floor(timestamps.length / 2), timestamps.length - 1].map((i) => ({
      label: new Date(timestamps[i] * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      x: padding.left + (i / (timestamps.length - 1)) * chartWidth,
    }));

    return (
      <div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 4,
              }}
            >
              PORTFOLIO VALUE
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 20,
                fontWeight: 700,
                color: '#e8edf5',
              }}
            >
              $
              {endVal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 4,
              }}
            >
              TOTAL RETURN
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 20,
                fontWeight: 700,
                color: lineColor,
              }}
            >
              {isPositive ? '+' : ''}
              {totalReturn}%
            </div>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#7a8fa8',
                marginBottom: 4,
              }}
            >
              P&L
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 20,
                fontWeight: 700,
                color: lineColor,
              }}
            >
              {isPositive ? '+' : ''}$
              {parseFloat(totalDollar).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
            {yLabels.map((label, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={label.y}
                  x2={width - padding.right}
                  y2={label.y}
                  stroke="#1e2a3a"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 6}
                  y={label.y + 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="#3d5068"
                  fontFamily="monospace"
                >
                  ${(label.value / 1000).toFixed(1)}k
                </text>
              </g>
            ))}

            <path d={fillD} fill={lineColor} opacity="0.08" />

            <path
              d={pathD}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {points.length > 0 && (
              <circle
                cx={parseFloat(points[points.length - 1].split(',')[0])}
                cy={parseFloat(points[points.length - 1].split(',')[1])}
                r="4"
                fill={lineColor}
              />
            )}

            {xLabels.map((label, i) => (
              <text
                key={i}
                x={label.x}
                y={height - 6}
                textAnchor="middle"
                fontSize="8"
                fill="#3d5068"
                fontFamily="monospace"
              >
                {label.label}
              </text>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 16,
      }}
    >
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
        <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: '#00ff88' }}>
          PERFORMANCE
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${period === p.value ? '#00ff88' : '#1e2a3a'}`,
                background: period === p.value ? '#00ff8815' : 'transparent',
                color: period === p.value ? '#00ff88' : '#7a8fa8',
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div
          style={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          LOADING CHART...
        </div>
      ) : error ? (
        <div
          style={{
            height: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ff8fa0',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : (
        renderChart()
      )}
    </div>
  );
}
