import { getPositions } from '@/lib/api/alpaca';

const SECTOR_MAP: Record<string, string> = {
  NVDA: 'AI/Semiconductors',
  AMD: 'AI/Semiconductors',
  INTC: 'AI/Semiconductors',
  QCOM: 'AI/Semiconductors',
  META: 'Tech/Social',
  GOOGL: 'Tech/Advertising',
  SNAP: 'Tech/Social',
  AAPL: 'Tech/Consumer',
  MSFT: 'Tech/Cloud',
  AMZN: 'Tech/Cloud',
  CRM: 'Tech/Cloud',
  TSLA: 'EV/Auto',
  GM: 'Auto',
  F: 'Auto',
  RIVN: 'EV/Auto',
  JPM: 'Financials',
  GS: 'Financials',
  BAC: 'Financials',
  MS: 'Financials',
  LLY: 'Healthcare/Pharma',
  PFE: 'Healthcare/Pharma',
  NVO: 'Healthcare/Pharma',
  MRNA: 'Healthcare/Pharma',
  XLE: 'Energy',
  XOM: 'Energy',
  CVX: 'Energy',
  COP: 'Energy',
  QQQ: 'Tech Index',
  SPY: 'Market Index',
  IWM: 'Small Cap Index',
  TLT: 'Bonds',
  GLD: 'Commodities',
};

export interface CorrelationAlert {
  tickers: string[];
  sector: string;
  risk_level: 'high' | 'medium';
  message: string;
  combined_exposure: number;
  recommendation: string;
}

interface AlpacaPositionRow {
  symbol: string;
  market_value?: string;
}

const TECH_STOCKS = ['NVDA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'AMD'];

function underlyingSymbol(symbol: string): string {
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol) ? symbol.replace(/\d.*/, '') : symbol;
}

export async function runCorrelationMonitor(): Promise<CorrelationAlert[]> {
  const positions = (await getPositions()) as AlpacaPositionRow[];
  if (!positions || positions.length < 2) return [];

  const alerts: CorrelationAlert[] = [];

  const sectorGroups: Record<string, { ticker: string; value: number }[]> = {};
  let totalPortfolioValue = 0;

  positions.forEach((p) => {
    const ticker = underlyingSymbol(p.symbol);
    const value = parseFloat(p.market_value || '0');
    totalPortfolioValue += value;

    const sector = SECTOR_MAP[ticker] || 'Unknown';
    if (!sectorGroups[sector]) sectorGroups[sector] = [];
    sectorGroups[sector].push({ ticker, value });
  });

  Object.entries(sectorGroups).forEach(([sector, holdings]) => {
    if (holdings.length >= 2 && totalPortfolioValue > 0) {
      const combinedValue = holdings.reduce((sum, h) => sum + h.value, 0);
      const combinedPct = (combinedValue / totalPortfolioValue) * 100;
      const tickers = [...new Set(holdings.map((h) => h.ticker))];

      if (combinedPct > 25) {
        alerts.push({
          tickers,
          sector,
          risk_level: combinedPct > 35 ? 'high' : 'medium',
          message: `${tickers.join(' + ')} are both in ${sector} — ${combinedPct.toFixed(0)}% combined sector exposure`,
          combined_exposure: combinedPct,
          recommendation: `Consider trimming one position to reduce ${sector} concentration below 20%`,
        });
      }
    }
  });

  const hasQQQ = positions.some((p) => underlyingSymbol(p.symbol) === 'QQQ');
  const hasSPY = positions.some((p) => underlyingSymbol(p.symbol) === 'SPY');
  const techStocks = positions.filter((p) => TECH_STOCKS.includes(underlyingSymbol(p.symbol)));

  if ((hasQQQ || hasSPY) && techStocks.length >= 2) {
    const indexTicker = hasQQQ ? 'QQQ' : 'SPY';
    const techTickers = [...new Set(techStocks.map((p) => underlyingSymbol(p.symbol)))];
    alerts.push({
      tickers: [indexTicker, ...techTickers],
      sector: 'Tech Index + Individual Tech',
      risk_level: 'medium',
      message: `Holding ${indexTicker} alongside ${techTickers.join(', ')} creates redundant tech exposure — a tech selloff hits all positions simultaneously`,
      combined_exposure: 0,
      recommendation: `Consider whether ${indexTicker} hedge or individual stock positions serve the strategy better — not both`,
    });
  }

  return alerts;
}
