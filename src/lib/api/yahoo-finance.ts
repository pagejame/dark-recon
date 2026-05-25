import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface AnalystData {
  ticker: string;
  current_price: number;
  target_price_low: number;
  target_price_mean: number;
  target_price_high: number;
  upside_pct: number;
  recommendation: string;
  num_analysts: number;
  earnings_growth_est: number;
  revenue_growth_est: number;
  insider_buy_count: number;
  insider_sell_count: number;
  insider_signal: 'buying' | 'selling' | 'neutral';
  summary: string;
}

export async function getAnalystData(ticker: string): Promise<AnalystData | null> {
  try {
    const quoteSummary = await yahooFinance
      .quoteSummary(ticker, {
        modules: ['financialData', 'recommendationTrend', 'earningsTrend'],
      })
      .catch(() => null);

    if (!quoteSummary) return null;

    const financial = quoteSummary.financialData;
    const recommendations = quoteSummary.recommendationTrend?.trend?.[0];

    const currentPrice = financial?.currentPrice || 0;
    const targetMean = financial?.targetMeanPrice || currentPrice;
    const targetLow = financial?.targetLowPrice || currentPrice;
    const targetHigh = financial?.targetHighPrice || currentPrice;
    const upsidePct = currentPrice > 0 ? ((targetMean - currentPrice) / currentPrice) * 100 : 0;

    const totalRecs =
      (recommendations?.strongBuy || 0) +
      (recommendations?.buy || 0) +
      (recommendations?.hold || 0) +
      (recommendations?.sell || 0) +
      (recommendations?.strongSell || 0);

    const buyRecs = (recommendations?.strongBuy || 0) + (recommendations?.buy || 0);
    const sellRecs = (recommendations?.sell || 0) + (recommendations?.strongSell || 0);

    let recommendation = 'hold';
    if (buyRecs / Math.max(1, totalRecs) > 0.75) recommendation = 'strongBuy';
    else if (buyRecs / Math.max(1, totalRecs) > 0.6) recommendation = 'buy';
    else if (sellRecs / Math.max(1, totalRecs) > 0.4) recommendation = 'sell';

    const earningsGrowth = financial?.earningsGrowth ? financial.earningsGrowth * 100 : 0;
    const revenueGrowth = financial?.revenueGrowth ? financial.revenueGrowth * 100 : 0;

    const summary =
      upsidePct > 15
        ? `${totalRecs} analysts with mean target $${targetMean?.toFixed(0)} — ${upsidePct.toFixed(1)}% upside. ${recommendation.toUpperCase()} consensus.`
        : upsidePct < -10
          ? `${totalRecs} analysts with mean target $${targetMean?.toFixed(0)} — ${Math.abs(upsidePct).toFixed(1)}% downside risk. ${recommendation.toUpperCase()} consensus.`
          : `${totalRecs} analysts with mean target $${targetMean?.toFixed(0)} — fairly valued. ${recommendation.toUpperCase()} consensus.`;

    return {
      ticker,
      current_price: currentPrice,
      target_price_low: targetLow || 0,
      target_price_mean: targetMean || 0,
      target_price_high: targetHigh || 0,
      upside_pct: upsidePct,
      recommendation,
      num_analysts: totalRecs,
      earnings_growth_est: earningsGrowth,
      revenue_growth_est: revenueGrowth,
      insider_buy_count: 0,
      insider_sell_count: 0,
      insider_signal: 'neutral',
      summary,
    };
  } catch (e) {
    console.error(`Yahoo Finance error for ${ticker}:`, e);
    return null;
  }
}

export async function getTopAnalystPicks(tickers: string[], minUpside = 10): Promise<AnalystData[]> {
  const results: AnalystData[] = [];

  const batchSize = 5;
  for (let i = 0; i < Math.min(tickers.length, 30); i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((ticker) => getAnalystData(ticker)));
    batchResults.forEach((r) => {
      if (r && r.upside_pct >= minUpside && r.num_analysts >= 3) {
        results.push(r);
      }
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  return results.sort((a, b) => b.upside_pct - a.upside_pct);
}
