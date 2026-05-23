import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { CongressionalTrade } from '@/lib/api/smartmoney';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TopTicker {
  ticker: string;
  count: number;
  buys: number;
  sells: number;
}

interface SmartMoneyAnalysis {
  sector_rotation: string;
  notable_signals: string;
  top_conviction_picks: string[];
  actionable_takeaways: string[];
  risk_note: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const notable = (body.notable || []) as CongressionalTrade[];
    const top_tickers = (body.top_tickers || []) as TopTicker[];

    const tradesContext =
      notable
        .slice(0, 10)
        .map(
          (t) =>
            `${t.representative} (${t.chamber}): ${t.type} ${t.ticker} — ${t.amount} on ${t.transaction_date}`
        )
        .join('\n') || 'No notable trades found';

    const topTickersContext =
      top_tickers
        .slice(0, 10)
        .map((t) => `${t.ticker}: ${t.count} total trades (${t.buys} buys, ${t.sells} sells)`)
        .join('\n') || 'No data';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's Smart Money analyst. Analyze this congressional trading data and provide actionable intelligence.

NOTABLE CONGRESSIONAL TRADES (last 90 days):
${tradesContext}

MOST TRADED TICKERS BY CONGRESS:
${topTickersContext}

Provide analysis in this exact JSON format (no markdown, raw JSON only):
{
  "sector_rotation": "2-3 sentences about which sectors congress is concentrating in and what that signals",
  "notable_signals": "2-3 sentences about any unusual patterns, concentration of buys, or timing relative to legislation",
  "top_conviction_picks": ["TICKER1 — reason", "TICKER2 — reason", "TICKER3 — reason"],
  "actionable_takeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "risk_note": "One sentence about any conflicts of interest or data limitations to be aware of"
}`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const result = JSON.parse(raw.slice(start, end + 1)) as SmartMoneyAnalysis;
    return NextResponse.json(result);
  } catch (error) {
    console.error('Smart money analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
