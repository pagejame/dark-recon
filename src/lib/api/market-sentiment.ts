export interface FearGreedData {
  value: number;
  label: string;
  previous_close: number;
  previous_week: number;
  previous_month: number;
  trading_signal: string;
  is_contrarian_buy: boolean;
  is_contrarian_sell: boolean;
}

export interface EconomicEvent {
  date: string;
  time: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  forecast?: string;
  previous?: string;
  is_today: boolean;
  is_this_week: boolean;
  market_impact: string;
}

export async function getFearGreedIndex(): Promise<FearGreedData | null> {
  try {
    const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const current = data?.fear_and_greed;
    if (!current) return null;

    const value = Math.round(current.score || 50);

    const label =
      value <= 20
        ? 'Extreme Fear'
        : value <= 40
          ? 'Fear'
          : value <= 60
            ? 'Neutral'
            : value <= 80
              ? 'Greed'
              : 'Extreme Greed';

    const isExtremeFear = value <= 20;
    const isExtremeGreed = value >= 80;

    const historical = data?.fear_and_greed_historical?.data || [];

    return {
      value,
      label,
      previous_close: Math.round(historical.slice(-2, -1)?.[0]?.y || value),
      previous_week: Math.round(historical.slice(-6, -5)?.[0]?.y || value),
      previous_month: Math.round(historical.slice(-22, -21)?.[0]?.y || value),
      trading_signal: isExtremeFear
        ? 'CONTRARIAN BUY — Extreme Fear historically precedes market recoveries'
        : isExtremeGreed
          ? 'CONTRARIAN CAUTION — Extreme Greed historically precedes pullbacks'
          : value < 40
            ? 'Fear zone — slight contrarian lean bullish'
            : value > 60
              ? 'Greed zone — slight contrarian caution'
              : 'Neutral — no strong contrarian signal',
      is_contrarian_buy: isExtremeFear,
      is_contrarian_sell: isExtremeGreed,
    };
  } catch {
    return null;
  }
}

const HIGH_IMPACT_EVENTS = [
  'Federal Funds Rate',
  'CPI',
  'Consumer Price Index',
  'Non-Farm Payroll',
  'GDP',
  'Unemployment Rate',
  'FOMC',
  'Fed Minutes',
  'PPI',
  'Retail Sales',
  'ISM Manufacturing',
  'PCE',
  'Jobs Report',
];

export async function getUpcomingEconomicEvents(): Promise<EconomicEvent[]> {
  const events: EconomicEvent[] = [];

  try {
    const FRED_KEY = process.env.FRED_API_KEY || '';
    if (!FRED_KEY) return [];

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await fetch(
      `https://api.stlouisfed.org/fred/releases/dates?api_key=${FRED_KEY}&file_type=json&realtime_start=${today}&realtime_end=${nextWeek}&limit=50`,
      { signal: AbortSignal.timeout(6000) }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const releases = data?.release_dates || [];

    for (const release of releases.slice(0, 20)) {
      const isHighImpact = HIGH_IMPACT_EVENTS.some((e) =>
        String(release.release_name || '')
          .toLowerCase()
          .includes(e.toLowerCase())
      );

      const eventDate = new Date(release.date);
      const isToday = release.date === today;
      const isThisWeek = eventDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      events.push({
        date: release.date,
        time: '8:30 AM ET',
        event: release.release_name || '',
        impact: isHighImpact ? 'high' : 'medium',
        is_today: isToday,
        is_this_week: isThisWeek,
        market_impact: isHighImpact
          ? `HIGH IMPACT — ${release.release_name} can move markets significantly. Agent will tighten conviction requirements during release window.`
          : 'Medium impact — monitor for market reaction',
      });
    }
  } catch {
    /* skip */
  }

  return events
    .filter((e) =>
      HIGH_IMPACT_EVENTS.some((h) => e.event.toLowerCase().includes(h.toLowerCase()))
    )
    .slice(0, 10);
}
