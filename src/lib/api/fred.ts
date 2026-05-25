const FRED_KEY = process.env.FRED_API_KEY || '';
const FRED_BASE = 'https://api.stlouisfed.org/fred';

export interface MacroIndicator {
  series_id: string;
  name: string;
  value: number;
  date: string;
  change?: number;
  trend: 'rising' | 'falling' | 'stable';
  market_implication: string;
}

export interface MacroSnapshot {
  fed_funds_rate: MacroIndicator | null;
  inflation_cpi: MacroIndicator | null;
  unemployment: MacroIndicator | null;
  gdp_growth: MacroIndicator | null;
  treasury_10y: MacroIndicator | null;
  treasury_2y: MacroIndicator | null;
  yield_curve: number | null;
  yield_curve_signal: string;
  macro_regime: 'expansionary' | 'contractionary' | 'stagflation' | 'neutral';
  market_backdrop: string;
  updated_at: string;
}

async function fetchFREDSeries(
  seriesId: string,
  limit = 2
): Promise<{ value: number; date: string }[] | null> {
  if (!FRED_KEY) return null;
  try {
    const url = `${FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = (data?.observations || []).filter(
      (o: { value: string }) => o.value !== '.'
    );
    return obs.map((o: { value: string; date: string }) => ({
      value: parseFloat(o.value),
      date: o.date,
    }));
  } catch {
    return null;
  }
}

function buildIndicator(
  seriesId: string,
  name: string,
  data: { value: number; date: string }[] | null,
  implicationFn: (val: number, prev: number | null) => string
): MacroIndicator | null {
  if (!data || data.length === 0) return null;
  const current = data[0];
  const previous = data[1]?.value ?? null;
  const change = previous !== null ? current.value - previous : undefined;
  const trend =
    change !== undefined
      ? change > 0.05
        ? 'rising'
        : change < -0.05
          ? 'falling'
          : 'stable'
      : 'stable';

  return {
    series_id: seriesId,
    name,
    value: current.value,
    date: current.date,
    change,
    trend,
    market_implication: implicationFn(current.value, previous),
  };
}

let macroCache: { data: MacroSnapshot; timestamp: number } | null = null;
const MACRO_CACHE_TTL = 6 * 60 * 60 * 1000;

export async function getMacroSnapshot(): Promise<MacroSnapshot> {
  if (macroCache && Date.now() - macroCache.timestamp < MACRO_CACHE_TTL) {
    return macroCache.data;
  }

  const [fedFundsData, cpiData, unemploymentData, gdpData, treasury10yData, treasury2yData] =
    await Promise.all([
      fetchFREDSeries('FEDFUNDS', 2),
      fetchFREDSeries('CPIAUCSL', 2),
      fetchFREDSeries('UNRATE', 2),
      fetchFREDSeries('A191RL1Q225SBEA', 2),
      fetchFREDSeries('DGS10', 2),
      fetchFREDSeries('DGS2', 2),
    ]);

  const fed_funds_rate = buildIndicator(
    'FEDFUNDS',
    'Fed Funds Rate',
    fedFundsData,
    (val) =>
      val > 4
        ? `High rates (${val}%) — restrictive for growth stocks, favorable for financials`
        : val < 2
          ? `Low rates (${val}%) — stimulative, favorable for growth and tech`
          : `Neutral rates (${val}%)`
  );

  const inflation_cpi = buildIndicator('CPIAUCSL', 'CPI Inflation', cpiData, (val, prev) => {
    if (!prev) return `CPI at ${val}`;
    const yoyEstimate = ((val - prev) / prev) * 1200;
    return yoyEstimate > 4
      ? 'Inflation elevated — Fed likely hawkish, growth stocks under pressure'
      : yoyEstimate < 2
        ? 'Inflation cooling — Fed may cut rates, bullish for growth'
        : 'Inflation moderate — neutral backdrop';
  });

  const unemployment = buildIndicator('UNRATE', 'Unemployment Rate', unemploymentData, (val) =>
    val < 4
      ? `Strong labor market (${val}%) — consumer spending resilient, Fed less likely to cut`
      : val > 6
        ? `Weak labor market (${val}%) — recession risk, defensive positioning warranted`
        : `Healthy labor market (${val}%)`
  );

  const gdp_growth = buildIndicator('A191RL1Q225SBEA', 'Real GDP Growth', gdpData, (val) =>
    val > 3
      ? `Strong GDP growth (${val}%) — risk-on environment`
      : val < 0
        ? `Negative GDP growth (${val}%) — recession territory, risk-off`
        : `Moderate growth (${val}%)`
  );

  const treasury_10y = buildIndicator('DGS10', '10-Year Treasury', treasury10yData, (val) =>
    `10Y yield at ${val}%`
  );

  const treasury_2y = buildIndicator('DGS2', '2-Year Treasury', treasury2yData, (val) =>
    `2Y yield at ${val}%`
  );

  const yieldCurve =
    treasury_10y && treasury_2y ? treasury_10y.value - treasury_2y.value : null;

  const yieldCurveSignal =
    yieldCurve === null
      ? 'Unknown'
      : yieldCurve < -0.5
        ? `Deeply inverted yield curve (${yieldCurve.toFixed(2)}%) — historically precedes recession`
        : yieldCurve < 0
          ? `Inverted yield curve (${yieldCurve.toFixed(2)}%) — caution warranted`
          : yieldCurve < 0.5
            ? `Flat yield curve (${yieldCurve.toFixed(2)}%) — uncertainty`
            : `Normal yield curve (${yieldCurve.toFixed(2)}%) — healthy growth environment`;

  const fedRate = fed_funds_rate?.value || 3;
  const unemployment_val = unemployment?.value || 4;
  const gdp_val = gdp_growth?.value || 2;

  let macro_regime: MacroSnapshot['macro_regime'] = 'neutral';
  if (gdp_val > 2 && unemployment_val < 5 && fedRate < 4) macro_regime = 'expansionary';
  else if (gdp_val < 1 || unemployment_val > 6) macro_regime = 'contractionary';
  else if (inflation_cpi?.trend === 'rising' && gdp_val < 2) macro_regime = 'stagflation';

  const market_backdrop = `MACRO BACKDROP: ${macro_regime.toUpperCase()} regime.
Fed Funds: ${fed_funds_rate?.value || 'N/A'}% (${fed_funds_rate?.trend || 'stable'}) | ${fed_funds_rate?.market_implication || ''}
Unemployment: ${unemployment?.value || 'N/A'}% | ${unemployment?.market_implication || ''}
GDP Growth: ${gdp_growth?.value || 'N/A'}% | ${gdp_growth?.market_implication || ''}
Yield Curve: ${yieldCurveSignal}
TRADING IMPLICATION: ${
    macro_regime === 'expansionary'
      ? 'Favor growth stocks, tech, consumer discretionary. Momentum strategies work well.'
      : macro_regime === 'contractionary'
        ? 'Defensive positioning. Favor utilities, healthcare, staples. Reduce position sizes.'
        : macro_regime === 'stagflation'
          ? 'Favor commodities, energy, real assets. Avoid long-duration growth stocks.'
          : 'Balanced approach. Follow sector rotation and momentum signals.'
  }`;

  const snapshot: MacroSnapshot = {
    fed_funds_rate,
    inflation_cpi,
    unemployment,
    gdp_growth,
    treasury_10y,
    treasury_2y,
    yield_curve: yieldCurve,
    yield_curve_signal: yieldCurveSignal,
    macro_regime,
    market_backdrop,
    updated_at: new Date().toISOString(),
  };

  macroCache = { data: snapshot, timestamp: Date.now() };
  return snapshot;
}
