import Anthropic from '@anthropic-ai/sdk';
import { getTickerSnapshot, getTickerNews, getPreviousClose } from '@/lib/api/polygon';

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
}

interface NewsArticle {
  title?: string;
  published_utc?: string;
}

interface SnapshotTicker {
  ticker?: string;
  todaysChangePerc?: number;
  day?: { c?: number; v?: number };
  prevDay?: { v?: number };
  last?: { price?: number };
}

export async function buildThesis(ticker: string): Promise<ThesisResult> {
  const upperTicker = ticker.toUpperCase();

  const [snapshot, , news] = await Promise.allSettled([
    getTickerSnapshot(upperTicker),
    getPreviousClose(upperTicker),
    getTickerNews(upperTicker, 5),
  ]);

  const snapshotData = snapshot.status === 'fulfilled' ? snapshot.value : null;
  const tickerData: SnapshotTicker | null =
    snapshotData?.ticker || snapshotData?.results || null;
  const currentPrice = tickerData?.day?.c || tickerData?.last?.price || 0;
  const changePercent = tickerData?.todaysChangePerc || 0;
  const volume = tickerData?.day?.v || 0;
  const prevVolume = tickerData?.prevDay?.v || 1;
  const volRatio = (volume / prevVolume).toFixed(2);

  const newsData = news.status === 'fulfilled' ? news.value : null;
  const recentNews =
    newsData?.results
      ?.slice(0, 5)
      ?.map((n: NewsArticle) => {
        const date = n.published_utc?.split('T')[0] || 'recent';
        return `${n.title} (${date})`;
      })
      ?.join('\n') || 'No recent news found';

  const dataContext = `
Ticker: ${upperTicker}
Current Price: $${currentPrice}
Today's Change: ${changePercent > 0 ? '+' : ''}${changePercent?.toFixed(2)}%
Volume vs Yesterday: ${volRatio}x

Recent News:
${recentNews}
`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Thesis Builder Agent — an elite AI analyst. Build a complete investment thesis for ${upperTicker}.

Market data:
${dataContext}

Return ONLY a valid JSON object with exactly this structure (no other text, no markdown):
{
  "ticker": "${upperTicker}",
  "company_name": "Full company name",
  "current_price": ${currentPrice || 0},
  "conviction_score": 7,
  "overall_direction": "bullish",
  "bull_case": {
    "summary": "One sentence bull thesis",
    "points": ["Point 1", "Point 2", "Point 3", "Point 4"],
    "price_target": "$XXX",
    "timeframe": "X-X months"
  },
  "bear_case": {
    "summary": "One sentence bear thesis",
    "points": ["Risk 1", "Risk 2", "Risk 3"],
    "downside_target": "$XXX",
    "key_risk": "Single biggest risk in one sentence"
  },
  "catalysts": {
    "upcoming": ["Catalyst 1", "Catalyst 2", "Catalyst 3"],
    "watch_dates": ["Date or event 1", "Date or event 2"]
  },
  "options_setup": {
    "recommended_play": "Buy $XXX Call" or "Buy $XXX Put",
    "strike": "$XXX",
    "expiration": "XX-XX days out",
    "rationale": "Why this specific setup",
    "max_loss": "Premium paid only",
    "potential_gain": "X-Xx if thesis plays out"
  },
  "technical_levels": {
    "support": "$XXX",
    "resistance": "$XXX",
    "trend": "Short description of current trend"
  },
  "insider_activity": "Summary of recent insider buying/selling or none detected",
  "news_sentiment": "bullish or bearish or neutral — one sentence",
  "dark_recon_verdict": "Two sentence final verdict — direct, confident, actionable",
  "generated_at": "${new Date().toISOString()}"
}`,
      },
    ],
  });

  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('');
  const clean = text.replace(/```json|```/g, '').trim();
  const result = JSON.parse(clean) as ThesisResult;
  return result;
}
