import Anthropic from '@anthropic-ai/sdk';
import { getMultipleSnapshots } from '@/lib/api/polygon';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DEFAULT_WATCHLIST = [
  'SPY', 'QQQ', 'NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL',
];

export interface ScanResult {
  ticker: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  summary: string;
  raw_data: unknown;
  scanned_at: string;
}

interface PolygonTickerSnapshot {
  ticker: string;
  todaysChangePerc?: number;
  day?: { v?: number; c?: number };
  prevDay?: { v?: number };
}

interface ClaudeSignal {
  ticker: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  summary: string;
}

export async function runMarketScan(
  watchlist: string[] = DEFAULT_WATCHLIST
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    const snapshots = await getMultipleSnapshots(watchlist);
    const tickers: PolygonTickerSnapshot[] = snapshots?.tickers || [];

    const dataString = tickers
      .map((t) => {
        const change = t.todaysChangePerc?.toFixed(2) || '0';
        const volume = t.day?.v || 0;
        const avgVolume = t.prevDay?.v || 1;
        const volRatio = (volume / avgVolume).toFixed(2);
        return `${t.ticker}: ${change}% change, volume ratio vs yesterday: ${volRatio}x, price: $${t.day?.c || 'N/A'}`;
      })
      .join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's Market Scanner Agent. Analyze this real-time market data and identify the top 3 most interesting signals. 

Market data:
${dataString}

For each signal return ONLY a JSON array with this structure:
[
  {
    "ticker": "NVDA",
    "signal_type": "unusual_volume",
    "strength": "high",
    "summary": "Volume running 4.2x average with 3.1% move. Momentum signal worth watching."
  }
]

Signal types: unusual_volume, momentum_breakout, unusual_options, reversal_candidate, sector_leader
Strength: high (act on it), medium (watch it), low (note it)
Return only valid JSON, no other text.`,
        },
      ],
    });

    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const signals: ClaudeSignal[] = JSON.parse(clean);

    signals.forEach((s) => {
      results.push({
        ...s,
        raw_data: tickers.find((t) => t.ticker === s.ticker),
        scanned_at: new Date().toISOString(),
      });
    });
  } catch (e) {
    console.error('Scanner agent error:', e);
  }

  return results;
}
