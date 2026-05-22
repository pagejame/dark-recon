import Anthropic from '@anthropic-ai/sdk';

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

export async function buildThesis(ticker: string): Promise<ThesisResult> {
  const upperTicker = ticker.toUpperCase().trim();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Generate a complete investment thesis for the stock ticker ${upperTicker}. 

Respond with a single JSON object only. No text before or after. No markdown. No code fences. Just the raw JSON object starting with { and ending with }.

Use this exact structure:
{
  "ticker": "${upperTicker}",
  "company_name": "NVIDIA Corporation",
  "current_price": 950,
  "conviction_score": 8,
  "overall_direction": "bullish",
  "bull_case": {
    "summary": "One sentence bull thesis here",
    "points": ["Point 1", "Point 2", "Point 3", "Point 4"],
    "price_target": "$1100",
    "timeframe": "6-12 months"
  },
  "bear_case": {
    "summary": "One sentence bear thesis here",
    "points": ["Risk 1", "Risk 2", "Risk 3"],
    "downside_target": "$750",
    "key_risk": "The single biggest risk in one sentence"
  },
  "catalysts": {
    "upcoming": ["Catalyst 1", "Catalyst 2", "Catalyst 3"],
    "watch_dates": ["Q2 Earnings - August", "GTC Conference - March"]
  },
  "options_setup": {
    "recommended_play": "Buy $1000 Call",
    "strike": "$1000",
    "expiration": "45-60 days out",
    "rationale": "Why this specific setup makes sense",
    "max_loss": "Premium paid only",
    "potential_gain": "3-5x if thesis plays out"
  },
  "technical_levels": {
    "support": "$880",
    "resistance": "$1000",
    "trend": "Uptrend with strong momentum"
  },
  "insider_activity": "No significant insider activity detected recently",
  "news_sentiment": "Bullish — strong AI demand narrative driving coverage",
  "dark_recon_verdict": "Two sentence final verdict that is direct and actionable. Tell the reader exactly what to do and why.",
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
    console.error('Raw response:', rawText);
    throw new Error('Could not find valid JSON in response');
  }

  const jsonStr = rawText.slice(start, end + 1);
  const result = JSON.parse(jsonStr) as ThesisResult;
  return result;
}
