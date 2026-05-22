import Anthropic from '@anthropic-ai/sdk';
import {
  getCompanyProfile,
  getBasicFinancials,
  getCompanyNews,
  getInsiderTransactions,
  getRecommendationTrends,
  getSymbolEarnings,
} from '@/lib/api/finnhub';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ThesisResult {
  ticker: string;
  company_name: string;
  current_price: number;
  conviction_score: number;
  overall_direction: 'bullish' | 'bearish' | 'neutral';
  bull_case: {
    summary: string;
    points: string[];
    price_target: string;
    timeframe: string;
  };
  bear_case: {
    summary: string;
    points: string[];
    downside_target: string;
    key_risk: string;
  };
  catalysts: {
    upcoming: string[];
    watch_dates: string[];
  };
  options_setup: {
    recommended_play: string;
    strike: string;
    expiration: string;
    rationale: string;
    max_loss: string;
    potential_gain: string;
  };
  technical_levels: {
    support: string;
    resistance: string;
    trend: string;
  };
  insider_activity: string;
  news_sentiment: string;
  dark_recon_verdict: string;
  generated_at: string;
  data_sources: string[];
}

interface CompanyProfile {
  name?: string;
  ticker?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
}

interface FinancialMetrics {
  '52WeekHigh'?: number;
  '52WeekLow'?: number;
  peBasicExclExtraTTM?: number;
  revenueGrowthTTMYoy?: number;
  epsGrowthTTMYoy?: number;
  roeTTM?: number;
  netMarginTTM?: number;
  currentRatioQuarterly?: number;
}

interface NewsItem {
  headline?: string;
}

interface InsiderTransaction {
  transactionType?: string;
}

interface RecommendationPeriod {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
}

interface EarningsQuarter {
  quarter?: number;
  year?: number;
  estimate?: number;
  actual?: number;
  surprisePercent?: number;
}

async function fetchFinnhubContext(ticker: string): Promise<{
  context: string;
  sources: string[];
}> {
  const sources: string[] = [];
  const parts: string[] = [];

  const [profile, financials, news, insiders, recommendations, earnings] =
    await Promise.allSettled([
      getCompanyProfile(ticker),
      getBasicFinancials(ticker),
      getCompanyNews(ticker, 14),
      getInsiderTransactions(ticker),
      getRecommendationTrends(ticker),
      getSymbolEarnings(ticker),
    ]);

  if (profile.status === 'fulfilled' && profile.value?.name) {
    const p = profile.value as CompanyProfile;
    parts.push(`Company: ${p.name} (${p.ticker}) — ${p.finnhubIndustry || 'Unknown industry'}`);
    if (p.marketCapitalization) {
      parts.push(`Market Cap: $${(p.marketCapitalization / 1000).toFixed(1)}B`);
    }
    if (p.shareOutstanding) {
      parts.push(`Shares Outstanding: ${p.shareOutstanding.toFixed(0)}M`);
    }
    sources.push('Company Profile');
  }

  if (financials.status === 'fulfilled' && financials.value?.metric) {
    const m = financials.value.metric as FinancialMetrics;
    const metrics: string[] = [];
    if (m['52WeekHigh']) metrics.push(`52W High: $${m['52WeekHigh']?.toFixed(2)}`);
    if (m['52WeekLow']) metrics.push(`52W Low: $${m['52WeekLow']?.toFixed(2)}`);
    if (m.peBasicExclExtraTTM) metrics.push(`P/E TTM: ${m.peBasicExclExtraTTM?.toFixed(1)}`);
    if (m.revenueGrowthTTMYoy)
      metrics.push(`Revenue Growth YoY: ${(m.revenueGrowthTTMYoy * 100).toFixed(1)}%`);
    if (m.epsGrowthTTMYoy)
      metrics.push(`EPS Growth YoY: ${(m.epsGrowthTTMYoy * 100).toFixed(1)}%`);
    if (m.roeTTM) metrics.push(`ROE: ${(m.roeTTM * 100).toFixed(1)}%`);
    if (m.netMarginTTM) metrics.push(`Net Margin: ${(m.netMarginTTM * 100).toFixed(1)}%`);
    if (m.currentRatioQuarterly)
      metrics.push(`Current Ratio: ${m.currentRatioQuarterly?.toFixed(2)}`);
    if (metrics.length > 0) {
      parts.push(`Key Financials: ${metrics.join(' | ')}`);
      sources.push('Financial Metrics');
    }
  }

  if (news.status === 'fulfilled' && Array.isArray(news.value) && news.value.length > 0) {
    const headlines = (news.value as NewsItem[])
      .slice(0, 5)
      .map((n) => `- ${n.headline}`)
      .join('\n');
    parts.push(`Recent News (last 14 days):\n${headlines}`);
    sources.push('Recent News');
  }

  if (insiders.status === 'fulfilled' && insiders.value?.data?.length > 0) {
    const recent = insiders.value.data as InsiderTransaction[];
    const recentSlice = recent.slice(0, 5);
    const buys = recentSlice.filter((t) => t.transactionType === 'P - Purchase').length;
    const sells = recentSlice.filter((t) => t.transactionType === 'S - Sale').length;
    if (buys > 0 || sells > 0) {
      parts.push(`Insider Activity (recent): ${buys} purchases, ${sells} sales among insiders`);
      if (buys > sells) {
        parts.push('Insider sentiment: BULLISH — more buying than selling');
      } else if (sells > buys) {
        parts.push('Insider sentiment: BEARISH — more selling than buying');
      }
      sources.push('Insider Transactions');
    }
  }

  if (
    recommendations.status === 'fulfilled' &&
    Array.isArray(recommendations.value) &&
    recommendations.value.length > 0
  ) {
    const latest = recommendations.value[0] as RecommendationPeriod;
    if (latest) {
      parts.push(
        `Analyst Consensus (${latest.period}): ${latest.strongBuy} Strong Buy | ${latest.buy} Buy | ${latest.hold} Hold | ${latest.sell} Sell | ${latest.strongSell} Strong Sell`
      );
      sources.push('Analyst Recommendations');
    }
  }

  if (earnings.status === 'fulfilled' && Array.isArray(earnings.value) && earnings.value.length > 0) {
    const recent = (earnings.value as EarningsQuarter[]).slice(0, 4);
    const earningsStr = recent
      .map(
        (e) =>
          `Q${e.quarter} ${e.year}: Est $${e.estimate?.toFixed(2)} | Actual $${e.actual?.toFixed(2)} | Surprise ${e.surprisePercent?.toFixed(1)}%`
      )
      .join(', ');
    parts.push(`Historical Earnings (last 4 quarters): ${earningsStr}`);
    sources.push('Earnings History');
  }

  return {
    context: parts.join('\n\n'),
    sources,
  };
}

export async function buildThesis(ticker: string): Promise<ThesisResult> {
  const upperTicker = ticker.toUpperCase().trim();

  const { context: finnhubContext, sources } = await fetchFinnhubContext(upperTicker).catch(() => ({
    context: '',
    sources: [] as string[],
  }));

  const dataSection = finnhubContext
    ? `\n\nREAL MARKET DATA (use this to inform your analysis):\n${finnhubContext}`
    : '\n\nNote: Live market data unavailable — use your training knowledge.';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Thesis Builder — an elite AI analyst with access to real market data. Build a complete, data-driven investment thesis for ${upperTicker}.${dataSection}

Respond with a single JSON object only. No text before or after. No markdown. No code fences. Just raw JSON starting with { and ending with }.

Use this exact structure and incorporate the real data provided above into your analysis:
{
  "ticker": "${upperTicker}",
  "company_name": "Full company name from the data above",
  "current_price": 0,
  "conviction_score": 7,
  "overall_direction": "bullish",
  "bull_case": {
    "summary": "One sentence bull thesis referencing specific data points from the real data above",
    "points": [
      "Specific point backed by real financial data",
      "Specific point backed by real news or insider activity",
      "Specific point backed by analyst consensus or earnings history",
      "Specific growth or momentum point"
    ],
    "price_target": "$XXX",
    "timeframe": "X-X months"
  },
  "bear_case": {
    "summary": "One sentence bear thesis referencing specific risks",
    "points": [
      "Specific valuation or financial risk",
      "Specific market or competitive risk",
      "Specific technical or macro risk"
    ],
    "downside_target": "$XXX",
    "key_risk": "The single biggest risk in one sentence"
  },
  "catalysts": {
    "upcoming": [
      "Specific catalyst 1 with timing",
      "Specific catalyst 2 with timing",
      "Specific catalyst 3 with timing"
    ],
    "watch_dates": [
      "Specific date or event 1",
      "Specific date or event 2"
    ]
  },
  "options_setup": {
    "recommended_play": "Buy $XXX Call or specific spread",
    "strike": "$XXX",
    "expiration": "XX-XX days out",
    "rationale": "Specific rationale referencing the thesis and data",
    "max_loss": "Premium paid only",
    "potential_gain": "X-Xx if thesis plays out in timeframe"
  },
  "technical_levels": {
    "support": "$XXX based on 52W data if available",
    "resistance": "$XXX",
    "trend": "Specific trend description"
  },
  "insider_activity": "Summary based on real insider data above or none detected",
  "news_sentiment": "Specific sentiment based on real news headlines above",
  "dark_recon_verdict": "Two sentence final verdict that is direct and actionable. Reference specific data points. Tell the reader exactly what to do.",
  "generated_at": "${new Date().toISOString()}"
}`,
      },
    ],
  });

  const rawText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    console.error('Thesis raw response:', rawText);
    throw new Error('Could not find valid JSON in thesis response');
  }

  const jsonStr = rawText.slice(start, end + 1);
  const result = JSON.parse(jsonStr) as ThesisResult;

  result.data_sources = sources.length > 0 ? sources : ['AI Training Knowledge'];

  return result;
}
