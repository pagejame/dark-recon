'use client';

interface HeatmapPosition {
  ticker: string;
  pnl_pct: number;
  pnl_dollar: number;
  market_value: number;
  portfolio_pct: number;
  current_price: number;
  entry_price: number;
}

interface PortfolioHeatmapProps {
  positions: HeatmapPosition[];
  totalEquity: number;
}

function getHeatmapColor(pnlPct: number): { bg: string; border: string; text: string } {
  if (pnlPct > 10) return { bg: '#00ff8825', border: '#00ff8860', text: '#00ff88' };
  if (pnlPct > 5) return { bg: '#00ff8815', border: '#00ff8840', text: '#00cc70' };
  if (pnlPct > 2) return { bg: '#00ff8808', border: '#00ff8825', text: '#00aa55' };
  if (pnlPct > 0) return { bg: '#00ff8804', border: '#00ff8815', text: '#008844' };
  if (pnlPct > -2) return { bg: '#ff3d5a04', border: '#ff3d5a15', text: '#cc2244' };
  if (pnlPct > -5) return { bg: '#ff3d5a08', border: '#ff3d5a25', text: '#ff3d5a' };
  if (pnlPct > -10) return { bg: '#ff3d5a15', border: '#ff3d5a40', text: '#ff6080' };
  return { bg: '#ff3d5a25', border: '#ff3d5a60', text: '#ff8fa0' };
}

export default function PortfolioHeatmap({ positions, totalEquity }: PortfolioHeatmapProps) {
  if (!positions || positions.length === 0) {
    return (
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
        NO OPEN POSITIONS
      </div>
    );
  }

  const sorted = [...positions].sort((a, b) => b.portfolio_pct - a.portfolio_pct);
  const totalPnL = positions.reduce((sum, p) => sum + p.pnl_dollar, 0);
  const totalPnLPct = totalEquity > 0 ? (totalPnL / totalEquity) * 100 : 0;

  return (
    <div>
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
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#7a8fa8',
          }}
        >
          PORTFOLIO HEATMAP — {positions.length} POSITIONS
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            color: totalPnL >= 0 ? '#00ff88' : '#ff3d5a',
            fontWeight: 700,
          }}
        >
          {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)} ({totalPnLPct >= 0 ? '+' : ''}
          {totalPnLPct.toFixed(2)}%) TODAY
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 8,
        }}
      >
        {sorted.map((pos) => {
          const colors = getHeatmapColor(pos.pnl_pct);
          const size = Math.max(80, Math.min(160, 80 + pos.portfolio_pct * 8));

          return (
            <div
              key={pos.ticker}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 14,
                minHeight: size,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'transform 0.1s',
              }}
              onClick={() => {
                window.location.href = `/thesis?ticker=${pos.ticker}`;
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#e8edf5',
                  marginBottom: 4,
                }}
              >
                {pos.ticker}
              </div>

              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#7a8fa8',
                  marginBottom: 8,
                }}
              >
                ${pos.current_price.toFixed(2)}
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: 700,
                    color: colors.text,
                  }}
                >
                  {pos.pnl_pct >= 0 ? '+' : ''}
                  {pos.pnl_pct.toFixed(2)}%
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: colors.text,
                    opacity: 0.8,
                  }}
                >
                  {pos.pnl_dollar >= 0 ? '+' : ''}${pos.pnl_dollar.toFixed(0)}
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      color: '#3d5068',
                      letterSpacing: 1,
                    }}
                  >
                    WEIGHT
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8' }}>
                    {pos.portfolio_pct.toFixed(1)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    background: '#1e2a3a',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, pos.portfolio_pct * 5)}%`,
                      background: colors.text,
                      borderRadius: 2,
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 8,
          background: '#0d1117',
          border: '1px solid #1e2a3a',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#3d5068',
            letterSpacing: 2,
          }}
        >
          CASH
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
          ${(totalEquity - positions.reduce((s, p) => s + p.market_value, 0)).toLocaleString()}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
          {(
            (1 - positions.reduce((s, p) => s + p.portfolio_pct, 0) / 100) *
            100
          ).toFixed(1)}
          %
        </span>
      </div>
    </div>
  );
}
