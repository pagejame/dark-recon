const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

export interface SectorData {
  sector: string;
  etf: string;
  price: number;
  change_1d: number;
  change_5d?: number;
  volume_ratio: number;
  flow: 'inflow' | 'outflow' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  rank: number;
}

export interface SectorRotation {
  leading_sectors: SectorData[];
  lagging_sectors: SectorData[];
  rotation_signal: string;
  market_regime: 'risk_on' | 'risk_off' | 'neutral';
  updated_at: string;
}

const SECTOR_ETFS: Record<string, string> = {
  Technology: 'XLK',
  Financials: 'XLF',
  Energy: 'XLE',
  Healthcare: 'XLV',
  Industrials: 'XLI',
  Communications: 'XLC',
  'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP',
  'Real Estate': 'XLRE',
  Materials: 'XLB',
  Utilities: 'XLU',
};

export async function getSectorRotation(): Promise<SectorRotation> {
  const sectorData: SectorData[] = [];

  await Promise.all(
    Object.entries(SECTOR_ETFS).map(async ([sector, etf]) => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${etf}`, {
          headers: { 'X-Finnhub-Token': FINNHUB_KEY },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.c) return;

        const changePct = data.dp || 0;
        const volume = data.v || 0;
        const avgVolume = data.av || volume;
        const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

        const flow = changePct > 0.5 ? 'inflow' : changePct < -0.5 ? 'outflow' : 'neutral';
        const strength =
          Math.abs(changePct) > 1.5 ? 'strong' : Math.abs(changePct) > 0.5 ? 'moderate' : 'weak';

        sectorData.push({
          sector,
          etf,
          price: data.c,
          change_1d: changePct,
          volume_ratio: Math.round(volumeRatio * 10) / 10,
          flow,
          strength,
          rank: 0,
        });
      } catch {
        /* skip */
      }
    })
  );

  sectorData.sort((a, b) => b.change_1d - a.change_1d);
  sectorData.forEach((s, i) => {
    s.rank = i + 1;
  });

  const leading = sectorData.filter((s) => s.flow === 'inflow').slice(0, 3);
  const lagging = sectorData.filter((s) => s.flow === 'outflow').slice(-3).reverse();

  const riskOnSectors = ['Technology', 'Consumer Discretionary', 'Industrials'];
  const riskOffSectors = ['Utilities', 'Consumer Staples', 'Healthcare'];

  const riskOnData = sectorData.filter((s) => riskOnSectors.includes(s.sector));
  const riskOffData = sectorData.filter((s) => riskOffSectors.includes(s.sector));

  const riskOnAvg =
    riskOnData.length > 0
      ? riskOnData.reduce((sum, s) => sum + s.change_1d, 0) / riskOnData.length
      : 0;
  const riskOffAvg =
    riskOffData.length > 0
      ? riskOffData.reduce((sum, s) => sum + s.change_1d, 0) / riskOffData.length
      : 0;

  const market_regime =
    riskOnAvg > riskOffAvg + 0.3
      ? 'risk_on'
      : riskOffAvg > riskOnAvg + 0.3
        ? 'risk_off'
        : 'neutral';

  const rotation_signal =
    leading.length > 0
      ? `Money rotating INTO ${leading.map((s) => s.sector).join(', ')} (+${leading[0]?.change_1d.toFixed(2)}%). ` +
        (lagging.length > 0
          ? `Rotating OUT OF ${lagging.map((s) => s.sector).join(', ')} (${lagging[0]?.change_1d.toFixed(2)}%). `
          : '') +
        `Market regime: ${market_regime.replace('_', ' ').toUpperCase()}.`
      : 'No clear sector rotation detected. Market moving uniformly.';

  return {
    leading_sectors: leading,
    lagging_sectors: lagging,
    rotation_signal,
    market_regime,
    updated_at: new Date().toISOString(),
  };
}
