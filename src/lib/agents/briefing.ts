import Anthropic from '@anthropic-ai/sdk';
import { getMultipleSnapshots, getMarketStatus } from '@/lib/api/polygon';
import { getRecentForm4Filings } from '@/lib/api/edgar';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface MorningBriefing {
  date: string;
  market_status: string;
  sentiment: 'risk_on' | 'risk_off' | 'neutral' | 'volatile';
  briefing_text: string;
  top_signals: string[];
  key_levels: { label: string; value: string; note: string }[];
  generated_at: string;
}

interface PolygonTickerSnapshot {
  ticker: string;
  todaysChangePerc?: number;
  day?: { c?: number };
}

export async function generateMorningBriefing(): Promise<MorningBriefing> {
  const today = new Date().toDateString();

  try {
    const [snapshots, marketStatus, insiderFilings] = await Promise.all([
      getMultipleSnapshots(['SPY', 'QQQ', 'VIX', 'NVDA', 'AMD', 'META', 'TSLA']),
      getMarketStatus(),
      getRecentForm4Filings(10),
    ]);

    void insiderFilings;

    const tickers: PolygonTickerSnapshot[] = snapshots?.tickers || [];
    const spy = tickers.find((t) => t.ticker === 'SPY');
    const qqq = tickers.find((t) => t.ticker === 'QQQ');

    const marketSummary = tickers
      .map(
        (t) =>
          `${t.ticker}: $${t.day?.c?.toFixed(2) || 'N/A'} (${t.todaysChangePerc?.toFixed(2) || '0'}%)`
      )
      .join(', ');

    const spyChange = spy?.todaysChangePerc || 0;
    const sentiment =
      spyChange > 0.5 ? 'risk_on' : spyChange < -0.5 ? 'risk_off' : 'neutral';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's Morning Briefing Agent. Generate today's pre-market intelligence briefing.

Date: ${today}
Market Status: ${marketStatus?.market || 'unknown'}
Live Data: ${marketSummary}
Overall sentiment: ${sentiment}

Write a sharp 4-paragraph briefing covering:
1. Current market condition and what it means for today's session
2. Top 2-3 opportunities based on the data — be specific with tickers and setups
3. Key risks and levels to watch
4. One clear tactical recommendation for the session

Tone: Direct, zero fluff, like a hedge fund analyst. Use real numbers from the data. Start with "DARK RECON — ${today}"`,
        },
      ],
    });

    const briefingText = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    return {
      date: today,
      market_status: marketStatus?.market || 'unknown',
      sentiment,
      briefing_text: briefingText,
      top_signals: tickers
        .filter((t) => Math.abs(t.todaysChangePerc || 0) > 1)
        .map(
          (t) =>
            `${t.ticker} ${(t.todaysChangePerc || 0) > 0 ? '+' : ''}${t.todaysChangePerc?.toFixed(2)}%`
        ),
      key_levels: [
        {
          label: 'SPY',
          value: `$${spy?.day?.c?.toFixed(2) || 'N/A'}`,
          note: `${spy?.todaysChangePerc?.toFixed(2) || '0'}% today`,
        },
        {
          label: 'QQQ',
          value: `$${qqq?.day?.c?.toFixed(2) || 'N/A'}`,
          note: `${qqq?.todaysChangePerc?.toFixed(2) || '0'}% today`,
        },
      ],
      generated_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Briefing agent error:', e);
    throw e;
  }
}
