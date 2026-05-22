import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ScanResult {
  ticker: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  summary: string;
  scanned_at: string;
}

const WATCHLIST = [
  'SPY', 'QQQ', 'NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL',
];

export async function runMarketScan(tickers?: string[]): Promise<ScanResult[]> {
  const watchlist = tickers && tickers.length > 0 ? tickers : WATCHLIST;
  const today = new Date().toDateString();
  const time = new Date().toLocaleTimeString();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Market Scanner Agent. Today is ${today} at ${time}.

Analyze these tickers and identify the 3 most interesting signals based on your knowledge of current market conditions: ${watchlist.join(', ')}

Respond with a single JSON array only. No text before or after. No markdown. No code fences. Just the raw JSON array starting with [ and ending with ].

Use this exact structure:
[
  {
    "ticker": "NVDA",
    "signal_type": "momentum_breakout",
    "strength": "high",
    "summary": "Specific 1-2 sentence summary of why this ticker is signaling right now based on current market knowledge."
  },
  {
    "ticker": "AMD", 
    "signal_type": "unusual_volume",
    "strength": "medium",
    "summary": "Specific 1-2 sentence summary."
  },
  {
    "ticker": "SPY",
    "signal_type": "sector_leader",
    "strength": "low",
    "summary": "Specific 1-2 sentence summary."
  }
]

Signal types: unusual_volume, momentum_breakout, unusual_options, reversal_candidate, sector_leader, insider_activity, squeeze_candidate
Strength values: high, medium, low

Base your analysis on your training knowledge of these companies and current macro conditions. Be specific and actionable.`,
      },
    ],
  });

  const rawText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  const start = rawText.indexOf('[');
  const end = rawText.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) {
    console.error('Scanner raw response:', rawText);
    throw new Error('Could not find valid JSON array in scanner response');
  }

  const jsonStr = rawText.slice(start, end + 1);
  const signals = JSON.parse(jsonStr) as Omit<ScanResult, 'scanned_at'>[];

  return signals.map((s) => ({
    ...s,
    scanned_at: new Date().toISOString(),
  }));
}
