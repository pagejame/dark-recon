import Anthropic from '@anthropic-ai/sdk';
import { getRecentCongressionalTrades } from '@/lib/api/smartmoney';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const TOP_10_CONGRESS = [
  { name: 'Nancy Pelosi', chamber: 'house', note: 'Consistently outperforms market' },
  { name: 'Paul Pelosi', chamber: 'house', note: 'Husband of Nancy Pelosi, known for large tech bets' },
  { name: 'Dan Crenshaw', chamber: 'house', note: 'Active trader, tech and energy focus' },
  { name: 'Tommy Tuberville', chamber: 'senate', note: 'Heavy defense sector trades' },
  { name: 'Josh Gottheimer', chamber: 'house', note: 'Frequent trader, tech focus' },
  { name: 'Ro Khanna', chamber: 'house', note: 'Silicon Valley district, tech insider knowledge' },
  { name: 'Brian Mast', chamber: 'house', note: 'Defense and aerospace focus' },
  { name: 'Marjorie Taylor Greene', chamber: 'house', note: 'Active market participant' },
  { name: 'Pat Fallon', chamber: 'house', note: 'Consistent trader, energy sector' },
  { name: 'Michael McCaul', chamber: 'house', note: 'Tech and defense, committee assignments' },
];

export interface CongressSignal {
  trader: string;
  chamber: string;
  note: string;
  ticker: string;
  action: 'buy' | 'sell';
  amount: string;
  date: string;
  days_ago: number;
  urgency: 'immediate' | 'watch' | 'noted';
  ai_analysis: string;
}

export interface CongressTrackerReport {
  generated_at: string;
  active_traders: string[];
  top_signals: CongressSignal[];
  sector_focus: string;
  overall_bias: 'bullish' | 'bearish' | 'mixed';
  ai_summary: string;
  follow_plays: {
    ticker: string;
    action: string;
    based_on: string;
    conviction: 'high' | 'medium' | 'low';
  }[];
}

function matchesTrader(representative: string, traderName: string): boolean {
  const nameParts = traderName.toLowerCase().split(' ');
  const repLower = representative.toLowerCase();
  return (
    nameParts.every((part) => part.length <= 2 || repLower.includes(part)) ||
    nameParts.some((part) => part.length > 3 && repLower.includes(part))
  );
}

export async function runCongressTracker(): Promise<CongressTrackerReport> {
  const allTrades = await getRecentCongressionalTrades(90, 200);

  const recentBuys = allTrades.filter(
    (t) =>
      t.type === 'Purchase' &&
      new Date(t.transaction_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  const supabase = createAdminClient();
  for (const trade of recentBuys.slice(0, 5)) {
    const notes = `${trade.representative} purchased ${trade.ticker} (${trade.amount}) on ${trade.transaction_date}`;
    try {
      await supabase.from('signals').insert({
        ticker: trade.ticker,
        signal_type: 'congressional_buy',
        strength: 'high',
        status: 'pending',
        source: `Smart Money — ${trade.representative}`,
        notes,
        summary: notes,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Congress signal insert error:', e);
    }
  }

  const top10Trades = allTrades.filter((trade) =>
    TOP_10_CONGRESS.some((trader) => matchesTrader(trade.representative, trader.name))
  );

  const traderActivity = TOP_10_CONGRESS.map((trader) => {
    const trades = top10Trades.filter((t) => matchesTrader(t.representative, trader.name));

    if (trades.length === 0) return `${trader.name}: No recent activity`;

    const tradeStr = trades
      .slice(0, 3)
      .map((t) => `  - ${t.type} ${t.ticker} (${t.amount}) on ${t.transaction_date}`)
      .join('\n');

    return `${trader.name} (${trader.note}):\n${tradeStr}`;
  }).join('\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Congressional Trading Intelligence Agent. Analyze the recent trading activity of these top 10 congressional traders and generate actionable intelligence.

TOP 10 CONGRESSIONAL TRADER ACTIVITY (last 90 days):
${traderActivity}

Generate a complete intelligence report in this exact JSON format. No markdown, raw JSON only, start with { end with }:

{
  "generated_at": "${new Date().toISOString()}",
  "active_traders": ["Name1", "Name2"],
  "top_signals": [
    {
      "trader": "Nancy Pelosi",
      "chamber": "house",
      "note": "Consistently outperforms market",
      "ticker": "NVDA",
      "action": "buy",
      "amount": "$500,001 - $1,000,000",
      "date": "2026-05-15",
      "days_ago": 8,
      "urgency": "immediate",
      "ai_analysis": "Pelosi's NVDA purchase comes ahead of potential AI chip export policy changes. Her position on relevant committees makes this a high-conviction follow signal."
    }
  ],
  "sector_focus": "Technology and Defense are the primary focus based on recent activity",
  "overall_bias": "bullish",
  "ai_summary": "2-3 sentence summary of what the top 10 congressional traders are collectively signaling right now. What sectors are they moving into? What are they avoiding?",
  "follow_plays": [
    {
      "ticker": "NVDA",
      "action": "Consider long position or call options",
      "based_on": "Multiple congressional purchases ahead of AI policy decisions",
      "conviction": "high"
    }
  ]
}

Focus on actionable intelligence. If a trader buys before their committee votes on relevant legislation, flag it as high urgency. Look for clustering — multiple traders buying the same sector is a stronger signal than a single trade.`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start === -1 || end === -1) throw new Error('Invalid congress tracker response');

  return JSON.parse(raw.slice(start, end + 1)) as CongressTrackerReport;
}
