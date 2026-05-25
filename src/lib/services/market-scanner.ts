import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketSymbols } from './market-symbols';
import { runMomentumScreener, saveMomentumResults, type MomentumStock } from './momentum-screener';
import { getSectorRotation, type SectorRotation } from './sector-rotation';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

export interface ScannerSignal {
  ticker: string;
  company_name?: string;
  scan_type: string;
  signal_strength: number;
  signal_data: Record<string, unknown>;
  raw_reason: string;
}

export interface ScannerResult {
  ticker: string;
  company_name?: string;
  scan_type: string;
  signal_strength: number;
  signal_data: Record<string, unknown>;
  claude_thesis: string;
  conviction_score: number;
  added_to_watchlist: boolean;
}

interface ClaudeAnalysisRow {
  ticker?: string;
  thesis?: string;
  conviction_score?: number;
  add_to_watchlist?: boolean;
  opportunity_type?: string;
}

async function scanPreMarketGaps(tickers: string[]): Promise<ScannerSignal[]> {
  const signals: ScannerSignal[] = [];
  const batchSize = 30;

  for (let i = 0; i < Math.min(tickers.length, 150); i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}`, {
            headers: { 'X-Finnhub-Token': FINNHUB_KEY },
            signal: AbortSignal.timeout(4000),
          });
          if (!res.ok) return;
          const data = await res.json();

          const changePct = data.dp || 0;
          const price = data.c || 0;
          const prevClose = data.pc || price;

          if (Math.abs(changePct) >= 2 && price > 0) {
            signals.push({
              ticker,
              scan_type: 'pre_market_gap',
              signal_strength: Math.min(100, Math.abs(changePct) * 10),
              signal_data: { price, change_pct: changePct, prev_close: prevClose },
              raw_reason: `${changePct > 0 ? 'Gapping UP' : 'Gapping DOWN'} ${Math.abs(changePct).toFixed(2)}% — $${price.toFixed(2)} vs prev close $${prevClose.toFixed(2)}`,
            });
          }
        } catch {
          /* skip */
        }
      })
    );
    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return signals
    .sort(
      (a, b) =>
        Math.abs((b.signal_data.change_pct as number) || 0) -
        Math.abs((a.signal_data.change_pct as number) || 0)
    )
    .slice(0, 20);
}

async function scanSocialTrending(): Promise<ScannerSignal[]> {
  const signals: ScannerSignal[] = [];
  try {
    const res = await fetch('https://api.stocktwits.com/api/2/trending/symbols.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return signals;
    const data = await res.json();
    const symbols = data?.symbols || [];

    symbols.slice(0, 15).forEach(
      (s: { symbol?: string; title?: string; watchlist_count?: number }, i: number) => {
        if (!s.symbol) return;
        signals.push({
          ticker: s.symbol,
          company_name: s.title,
          scan_type: 'social_trending',
          signal_strength: Math.max(10, 100 - i * 6),
          signal_data: {
            rank: i + 1,
            watchlist_count: s.watchlist_count,
            title: s.title,
          },
          raw_reason: `Trending #${i + 1} on Stocktwits — ${(s.watchlist_count || 0).toLocaleString()} users watching`,
        });
      }
    );
  } catch (e) {
    console.error('Stocktwits trending error:', e);
  }
  return signals;
}

async function scanSECFilings(): Promise<ScannerSignal[]> {
  const signals: ScannerSignal[] = [];
  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?category=general&minId=0`, {
      headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return signals;
    const news = await res.json();

    const materialKeywords = [
      'acquisition', 'merger', 'FDA approval', 'contract award', 'earnings beat',
      'guidance raised', 'buyback', 'special dividend', 'short squeeze', 'bankruptcy',
      'SEC investigation', 'class action', 'recall', 'patent', 'partnership',
    ];

    const tickerPattern = /\b([A-Z]{2,5})\b/g;
    const skipTickers = new Set([
      'THE', 'FOR', 'AND', 'BUT', 'INC', 'LLC', 'CEO', 'CFO', 'FDA', 'SEC', 'IPO', 'ETF',
    ]);

    (Array.isArray(news) ? news : []).slice(0, 50).forEach(
      (article: { headline?: string; summary?: string; url?: string; datetime?: number }) => {
        const text = ((article.headline || '') + ' ' + (article.summary || '')).toLowerCase();
        const hasKeyword = materialKeywords.some((kw) => text.includes(kw.toLowerCase()));
        if (!hasKeyword) return;

        const matches = article.headline?.match(tickerPattern) || [];
        const potentialTickers = matches.filter(
          (t: string) =>
            t.length >= 2 &&
            t.length <= 5 &&
            t === t.toUpperCase() &&
            !skipTickers.has(t)
        );

        potentialTickers.slice(0, 2).forEach((ticker: string) => {
          const matchedKeyword = materialKeywords.find((kw) => text.includes(kw.toLowerCase()));
          signals.push({
            ticker,
            scan_type: 'sec_news',
            signal_strength: 70,
            signal_data: {
              headline: article.headline?.slice(0, 200),
              url: article.url,
              datetime: article.datetime,
              keyword: matchedKeyword,
            },
            raw_reason: `Material event: ${matchedKeyword} — ${article.headline?.slice(0, 100)}`,
          });
        });
      }
    );
  } catch (e) {
    console.error('SEC news scan error:', e);
  }

  const seen = new Set<string>();
  return signals
    .filter((s) => {
      if (seen.has(s.ticker)) return false;
      seen.add(s.ticker);
      return true;
    })
    .slice(0, 15);
}

async function scanEarningsSurprises(): Promise<ScannerSignal[]> {
  const signals: ScannerSignal[] = [];
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${weekAgo}&to=${today}`,
      { headers: { 'X-Finnhub-Token': FINNHUB_KEY }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return signals;
    const data = await res.json();
    const earnings = data?.earningsCalendar || [];

    earnings
      .filter(
        (e: { epsActual?: number | null; epsEstimate?: number | null }) =>
          e.epsActual !== null && e.epsEstimate !== null && e.epsActual !== undefined
      )
      .forEach(
        (e: {
          symbol: string;
          epsActual: number;
          epsEstimate: number;
          date: string;
          revenueActual?: number;
          revenueEstimate?: number;
        }) => {
          const surprise =
            e.epsEstimate !== 0
              ? ((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 100
              : 0;

          if (Math.abs(surprise) >= 10) {
            signals.push({
              ticker: e.symbol,
              scan_type: 'earnings_surprise',
              signal_strength: Math.min(100, Math.abs(surprise)),
              signal_data: {
                eps_actual: e.epsActual,
                eps_estimate: e.epsEstimate,
                surprise_pct: surprise,
                date: e.date,
                revenue_actual: e.revenueActual,
                revenue_estimate: e.revenueEstimate,
              },
              raw_reason: `Earnings ${surprise > 0 ? 'BEAT' : 'MISS'} by ${Math.abs(surprise).toFixed(1)}% — EPS: $${e.epsActual} vs est $${e.epsEstimate}`,
            });
          }
        }
      );
  } catch (e) {
    console.error('Earnings surprise scan error:', e);
  }

  return signals
    .sort(
      (a, b) =>
        Math.abs((b.signal_data.surprise_pct as number) || 0) -
        Math.abs((a.signal_data.surprise_pct as number) || 0)
    )
    .slice(0, 15);
}

async function scanUnusualVolume(tickers: string[]): Promise<ScannerSignal[]> {
  const signals: ScannerSignal[] = [];
  const batchSize = 20;

  for (let i = 0; i < Math.min(tickers.length, 100); i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}`, {
            headers: { 'X-Finnhub-Token': FINNHUB_KEY },
            signal: AbortSignal.timeout(4000),
          });
          if (!res.ok) return;
          const data = await res.json();

          const volume = data.v || 0;
          const avgVolume = data.av || 0;

          if (avgVolume > 0 && volume > 0) {
            const volumeRatio = volume / avgVolume;
            if (volumeRatio >= 3) {
              signals.push({
                ticker,
                scan_type: 'unusual_volume',
                signal_strength: Math.min(100, volumeRatio * 20),
                signal_data: {
                  volume,
                  avg_volume: avgVolume,
                  volume_ratio: volumeRatio,
                  price: data.c,
                  change_pct: data.dp,
                },
                raw_reason: `Volume ${volumeRatio.toFixed(1)}x average — ${volume.toLocaleString()} vs avg ${avgVolume.toLocaleString()}`,
              });
            }
          }
        } catch {
          /* skip */
        }
      })
    );
    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return signals
    .sort(
      (a, b) =>
        ((b.signal_data.volume_ratio as number) || 0) -
        ((a.signal_data.volume_ratio as number) || 0)
    )
    .slice(0, 15);
}

export async function runFullMarketScan(): Promise<{
  signals: ScannerResult[];
  total_scanned: number;
  scan_types: Record<string, number>;
  top_opportunities: ScannerResult[];
  auto_added: string[];
  sector_rotation: SectorRotation;
  momentum_leaders: MomentumStock[];
}> {
  const supabase = createAdminClient();

  const allSymbols = await getMarketSymbols({ sp500Only: true });
  const emptySector = await getSectorRotation().catch(() => ({
    leading_sectors: [],
    lagging_sectors: [],
    rotation_signal: 'Sector data unavailable',
    market_regime: 'neutral' as const,
    updated_at: new Date().toISOString(),
  }));

  if (allSymbols.length === 0) {
    return {
      signals: [],
      total_scanned: 0,
      scan_types: {},
      top_opportunities: [],
      auto_added: [],
      sector_rotation: emptySector,
      momentum_leaders: [],
    };
  }

  const [
    gapSignals,
    socialSignals,
    secSignals,
    earningsSignals,
    volumeSignals,
    momentumData,
    sectorData,
  ] = await Promise.all([
    scanPreMarketGaps(allSymbols),
    scanSocialTrending(),
    scanSECFilings(),
    scanEarningsSurprises(),
    scanUnusualVolume(allSymbols),
    runMomentumScreener(),
    getSectorRotation(),
  ]);

  momentumData.top_gainers.slice(0, 10).forEach((stock) => {
    if (Math.abs(stock.change_1d) >= 2) {
      gapSignals.push({
        ticker: stock.ticker,
        scan_type: 'momentum',
        signal_strength: stock.relative_strength,
        signal_data: { change_1d: stock.change_1d, volume_ratio: stock.volume_ratio },
        raw_reason: stock.reason,
      });
    }
  });

  const allSignals = [
    ...gapSignals,
    ...socialSignals,
    ...secSignals,
    ...earningsSignals,
    ...volumeSignals,
  ];

  await saveMomentumResults(momentumData).catch(console.error);

  if (allSignals.length === 0) {
    return {
      signals: [],
      total_scanned: allSymbols.length,
      scan_types: { momentum: momentumData.high_momentum.length },
      top_opportunities: [],
      auto_added: [],
      sector_rotation: sectorData,
      momentum_leaders: momentumData.high_momentum.slice(0, 5),
    };
  }

  const { data: watchlist } = await supabase.from('watchlist').select('ticker');
  const watchlistSet = new Set((watchlist || []).map((w: { ticker: string }) => w.ticker));

  const tickerScores: Record<string, { signals: ScannerSignal[]; combined_strength: number }> =
    {};
  allSignals.forEach((signal) => {
    if (!tickerScores[signal.ticker]) {
      tickerScores[signal.ticker] = { signals: [], combined_strength: 0 };
    }
    tickerScores[signal.ticker].signals.push(signal);
    tickerScores[signal.ticker].combined_strength += signal.signal_strength;
  });

  const topTickers = Object.entries(tickerScores)
    .sort(([, a], [, b]) => b.combined_strength - a.combined_strength)
    .slice(0, 15);

  const sectorContext = `SECTOR ROTATION: ${sectorData.rotation_signal}
Market regime: ${sectorData.market_regime.toUpperCase()}
Leading sectors: ${sectorData.leading_sectors.map((s) => `${s.sector} ${s.change_1d >= 0 ? '+' : ''}${s.change_1d.toFixed(2)}%`).join(', ')}`;

  const analysisPrompt = topTickers
    .map(
      ([ticker, data]) =>
        `${ticker}: ${data.signals.map((s) => s.raw_reason).join(' | ')} (combined score: ${data.combined_strength.toFixed(0)})`
    )
    .join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Market Intelligence Agent. Analyze these market-wide scanner findings from today and score each opportunity.

${sectorContext}

SCANNER FINDINGS (${allSymbols.length} stocks scanned):
${analysisPrompt}

For each ticker, determine:
1. Is this a genuine trading opportunity or noise?
2. What's the conviction score (1-10)?
3. Should it be added to the watchlist for further monitoring?
4. One sentence thesis

Return ONLY valid JSON array:
[
  {
    "ticker": "NVDA",
    "thesis": "Gapping up 4% on unusual volume — momentum continuation likely",
    "conviction_score": 8,
    "add_to_watchlist": true,
    "opportunity_type": "momentum"
  }
]

Be selective — only include tickers with genuine actionable signals. Skip noise.`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');

  let claudeAnalysis: ClaudeAnalysisRow[] = [];
  try {
    claudeAnalysis = JSON.parse(raw.slice(start, end + 1));
  } catch {
    /* use empty */
  }

  const results: ScannerResult[] = [];
  const autoAdded: string[] = [];

  for (const analysis of claudeAnalysis) {
    const ticker = analysis.ticker;
    if (!ticker) continue;

    const tickerData = tickerScores[ticker];
    const primarySignal = tickerData?.signals.sort(
      (a, b) => b.signal_strength - a.signal_strength
    )[0];

    const result: ScannerResult = {
      ticker,
      company_name: primarySignal?.company_name,
      scan_type: primarySignal?.scan_type || 'multi_signal',
      signal_strength: tickerData?.combined_strength || 50,
      signal_data: {
        all_signals: tickerData?.signals.map((s) => ({
          type: s.scan_type,
          reason: s.raw_reason,
        })),
        ...(primarySignal?.signal_data || {}),
      },
      claude_thesis: analysis.thesis || '',
      conviction_score: analysis.conviction_score || 5,
      added_to_watchlist: false,
    };

    if (
      analysis.add_to_watchlist &&
      (analysis.conviction_score || 0) >= 7 &&
      !watchlistSet.has(ticker)
    ) {
      try {
        const { error: watchError } = await supabase.from('watchlist').insert({
          ticker: ticker.toUpperCase(),
          notes: `Auto-added by market scanner: ${analysis.thesis}`,
          added_at: new Date().toISOString(),
        });
        if (!watchError) {
          result.added_to_watchlist = true;
          autoAdded.push(ticker);
          watchlistSet.add(ticker);
        }
      } catch {
        /* skip */
      }
    }

    const { error: insertError } = await supabase.from('scanner_results').insert({
      scan_date: new Date().toISOString().split('T')[0],
      scan_type: result.scan_type,
      ticker,
      company_name: result.company_name,
      signal_strength: result.signal_strength,
      signal_data: result.signal_data,
      claude_thesis: result.claude_thesis,
      conviction_score: result.conviction_score,
      added_to_watchlist: result.added_to_watchlist,
    });
    if (insertError) console.error(insertError);

    results.push(result);
  }

  const scan_types: Record<string, number> = {};
  allSignals.forEach((s) => {
    scan_types[s.scan_type] = (scan_types[s.scan_type] || 0) + 1;
  });

  const top_opportunities = results
    .filter((r) => r.conviction_score >= 7)
    .sort((a, b) => b.conviction_score - a.conviction_score)
    .slice(0, 5);

  return {
    signals: results,
    total_scanned: allSymbols.length,
    scan_types,
    top_opportunities,
    auto_added: autoAdded,
    sector_rotation: sectorData,
    momentum_leaders: momentumData.high_momentum.slice(0, 5),
  };
}
