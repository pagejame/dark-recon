'use client';

interface CongressionalTrade {
  ticker?: string;
  type?: string;
}

interface SectorData {
  sector: string;
  tickers: string[];
  buys: number;
  sells: number;
  net: number;
  total_volume: string;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

const SECTOR_MAP: Record<string, { sector: string; color: string }> = {
  NVDA: { sector: 'AI/Semiconductors', color: '#3d9aff' },
  AMD: { sector: 'AI/Semiconductors', color: '#3d9aff' },
  INTC: { sector: 'AI/Semiconductors', color: '#3d9aff' },
  MSFT: { sector: 'Tech/Cloud', color: '#9b5de5' },
  AMZN: { sector: 'Tech/Cloud', color: '#9b5de5' },
  GOOGL: { sector: 'Tech/Advertising', color: '#9b5de5' },
  META: { sector: 'Tech/Social', color: '#9b5de5' },
  AAPL: { sector: 'Tech/Consumer', color: '#9b5de5' },
  TSLA: { sector: 'EV/Auto', color: '#f15bb5' },
  GM: { sector: 'Auto', color: '#f15bb5' },
  LMT: { sector: 'Defense', color: '#ff8c3d' },
  RTX: { sector: 'Defense', color: '#ff8c3d' },
  NOC: { sector: 'Defense', color: '#ff8c3d' },
  JPM: { sector: 'Financials', color: '#ffd700' },
  GS: { sector: 'Financials', color: '#ffd700' },
  BAC: { sector: 'Financials', color: '#ffd700' },
  LLY: { sector: 'Healthcare/Pharma', color: '#00ff88' },
  PFE: { sector: 'Healthcare/Pharma', color: '#00ff88' },
  NVO: { sector: 'Healthcare/Pharma', color: '#00ff88' },
  XLE: { sector: 'Energy', color: '#ff3d5a' },
  XOM: { sector: 'Energy', color: '#ff3d5a' },
  CVX: { sector: 'Energy', color: '#ff3d5a' },
};

function getSignal(buys: number, sells: number): SectorData['signal'] {
  const net = buys - sells;
  const total = buys + sells;
  if (total === 0) return 'neutral';
  const ratio = net / total;
  if (ratio > 0.6) return 'strong_buy';
  if (ratio > 0.2) return 'buy';
  if (ratio < -0.6) return 'strong_sell';
  if (ratio < -0.2) return 'sell';
  return 'neutral';
}

const SIGNAL_COLORS: Record<string, string> = {
  strong_buy: '#00ff88',
  buy: '#00cc70',
  neutral: '#7a8fa8',
  sell: '#ff8c3d',
  strong_sell: '#ff3d5a',
};

const SIGNAL_LABELS: Record<string, string> = {
  strong_buy: '⬆⬆ STRONG BUY',
  buy: '⬆ BUY',
  neutral: '→ NEUTRAL',
  sell: '⬇ SELL',
  strong_sell: '⬇⬇ STRONG SELL',
};

interface SectorHeatmapProps {
  trades: CongressionalTrade[];
}

export default function SectorHeatmap({ trades }: SectorHeatmapProps) {
  const sectorMap: Record<string, SectorData> = {};

  trades.forEach((trade) => {
    const ticker = trade.ticker?.toUpperCase();
    if (!ticker || !SECTOR_MAP[ticker]) return;

    const { sector } = SECTOR_MAP[ticker];
    if (!sectorMap[sector]) {
      sectorMap[sector] = {
        sector,
        tickers: [],
        buys: 0,
        sells: 0,
        net: 0,
        total_volume: '$0',
        signal: 'neutral',
      };
    }

    if (!sectorMap[sector].tickers.includes(ticker)) {
      sectorMap[sector].tickers.push(ticker);
    }

    if (trade.type === 'Purchase') sectorMap[sector].buys++;
    else sectorMap[sector].sells++;
  });

  const sectors = Object.values(sectorMap)
    .map((s) => ({
      ...s,
      net: s.buys - s.sells,
      signal: getSignal(s.buys, s.sells),
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  if (sectors.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: '#3d5068',
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: 2,
        }}
      >
        NO SECTOR DATA — Run congressional tracker to populate
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 3,
          color: '#7a8fa8',
          marginBottom: 14,
        }}
      >
        CONGRESSIONAL SECTOR ROTATION (90 days)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 8,
        }}
      >
        {sectors.map((sector) => {
          const color = SECTOR_MAP[sector.tickers[0]]?.color || '#7a8fa8';
          const signalColor = SIGNAL_COLORS[sector.signal];

          return (
            <div
              key={sector.sector}
              style={{
                background: '#0d1117',
                border: `1px solid ${color}30`,
                borderTop: `3px solid ${color}`,
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#e8edf5',
                  marginBottom: 4,
                }}
              >
                {sector.sector}
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  color: '#3d5068',
                  marginBottom: 8,
                }}
              >
                {sector.tickers.join(' · ')}
              </div>

              <div
                style={{
                  height: 4,
                  background: '#1e2a3a',
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(sector.buys / Math.max(1, sector.buys + sector.sells)) * 100}%`,
                    background: '#00ff88',
                    borderRadius: 2,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: 9 }}>
                  <span style={{ color: '#00ff88' }}>{sector.buys}B</span>
                  <span style={{ color: '#3d5068', margin: '0 4px' }}>·</span>
                  <span style={{ color: '#ff3d5a' }}>{sector.sells}S</span>
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 7,
                    letterSpacing: 1,
                    color: signalColor,
                    fontWeight: 700,
                  }}
                >
                  {SIGNAL_LABELS[sector.signal]}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
