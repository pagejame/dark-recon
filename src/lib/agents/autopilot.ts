import Anthropic from '@anthropic-ai/sdk';
import { getEarningsCalendar, type EarningsCalendarEvent } from '@/lib/api/finnhub';
import { getAccount, getPositions, getOrders } from '@/lib/api/alpaca';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AutopilotReport {
  date: string;
  market_sentiment: string;
  overall_action: 'aggressive' | 'moderate' | 'defensive' | 'hold';
  report_text: string;
  action_items: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    ticker?: string;
    rationale: string;
  }[];
  positions_review: {
    ticker: string;
    recommendation: 'hold' | 'add' | 'reduce' | 'close';
    rationale: string;
    current_pnl_pct?: number;
  }[];
  top_opportunities: {
    ticker: string;
    thesis: string;
    play: string;
    conviction: 'high' | 'medium' | 'low';
  }[];
  risk_flags: {
    flag: string;
    severity: 'high' | 'medium' | 'low';
  }[];
  generated_at: string;
}

interface AlpacaAccount {
  equity?: string;
  cash?: string;
  last_equity?: string;
  buying_power?: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price?: string;
  current_price?: string;
  unrealized_plpc?: string;
}

interface AlpacaOrder {
  status: string;
  side: string;
  qty: string;
  symbol: string;
  filled_avg_price?: string;
}

export async function runAutopilot(): Promise<AutopilotReport> {
  const today = new Date().toDateString();
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const isMarketOpen = (() => {
    const h = new Date().getHours();
    const d = new Date().getDay();
    return d >= 1 && d <= 5 && h >= 9 && h < 16;
  })();

  const [earningsResult, accountResult, positionsResult, ordersResult] =
    await Promise.allSettled([
      getEarningsCalendar(7),
      getAccount(),
      getPositions(),
      getOrders('all', 20),
    ]);

  const earnings =
    earningsResult.status === 'fulfilled'
      ? (earningsResult.value as EarningsCalendarEvent[])
      : [];
  const account =
    accountResult.status === 'fulfilled' ? (accountResult.value as AlpacaAccount) : null;
  const positions =
    positionsResult.status === 'fulfilled'
      ? (positionsResult.value as AlpacaPosition[])
      : [];
  const orders =
    ordersResult.status === 'fulfilled' ? (ordersResult.value as AlpacaOrder[]) : [];

  const earningsContext =
    earnings
      .filter((e) => e.symbol && e.date)
      .slice(0, 10)
      .map(
        (e) =>
          `${e.symbol} reports ${e.date} ${e.hour === 'bmo' ? 'pre-market' : 'after-close'}${e.epsEstimate ? ` (EPS est: $${e.epsEstimate})` : ''}`
      )
      .join('\n') || 'No major earnings this week';

  const portfolioContext = account
    ? `
Portfolio Value: $${parseFloat(account.equity || '0').toLocaleString()}
Cash: $${parseFloat(account.cash || '0').toLocaleString()}
Day P&L: $${parseFloat(account.equity || '0') - parseFloat(account.last_equity || '0') >= 0 ? '+' : ''}${(parseFloat(account.equity || '0') - parseFloat(account.last_equity || '0')).toFixed(2)}
Buying Power: $${parseFloat(account.buying_power || '0').toLocaleString()}
`
    : 'Portfolio data unavailable';

  const positionsContext =
    positions.length > 0
      ? positions
          .map((p) => {
            const pnlPct = parseFloat(p.unrealized_plpc || '0') * 100;
            return `${p.symbol}: ${p.qty} shares @ $${parseFloat(p.avg_entry_price || '0').toFixed(2)}, current $${parseFloat(p.current_price || '0').toFixed(2)}, P&L ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
          })
          .join('\n')
      : 'No open positions';

  const recentTradesContext =
    orders
      .filter((o) => o.status === 'filled')
      .slice(0, 5)
      .map((o) => `${o.side.toUpperCase()} ${o.qty} ${o.symbol} @ $${o.filled_avg_price}`)
      .join('\n') || 'No recent trades';

  const prompt = `You are Dark Recon's Autopilot Agent — an elite autonomous trading intelligence system. Today is ${today} (${dayOfWeek}). Market is currently ${isMarketOpen ? 'OPEN' : 'CLOSED'}.

Generate a complete autonomous daily action plan based on this real data:

PORTFOLIO STATUS:
${portfolioContext}

OPEN POSITIONS:
${positionsContext}

RECENT TRADES:
${recentTradesContext}

UPCOMING EARNINGS CATALYSTS:
${earningsContext}

Respond with ONLY a valid JSON object. No text before or after. No markdown. Start with { end with }.

{
  "date": "${today}",
  "market_sentiment": "risk_on",
  "overall_action": "moderate",
  "report_text": "AUTOPILOT — ${today}\\n\\n[Paragraph 1: Overall market assessment for today — be specific about conditions, what to watch, macro risks. 3-4 sentences.]\\n\\n[Paragraph 2: Portfolio review — assess each open position, what to do with it today. Be direct: hold, add, or trim.]\\n\\n[Paragraph 3: Top opportunities — 2-3 specific tickers worth analyzing today with specific reasons why now.]\\n\\n[Paragraph 4: Risk flags — what could go wrong today and how to protect the portfolio. Be specific.]\\n\\n[Paragraph 5: Today's game plan — one clear sentence per action. Maximum 4 actions. Prioritized.]",
  "action_items": [
    {
      "priority": "high",
      "action": "Specific action to take today",
      "ticker": "NVDA",
      "rationale": "Specific reason based on real data above"
    },
    {
      "priority": "medium", 
      "action": "Second action",
      "ticker": "QQQ",
      "rationale": "Specific reason"
    },
    {
      "priority": "low",
      "action": "Third action",
      "rationale": "Specific reason"
    }
  ],
  "positions_review": [
    {
      "ticker": "NVDA",
      "recommendation": "hold",
      "rationale": "Specific rationale based on current P&L and market conditions",
      "current_pnl_pct": 0.21
    }
  ],
  "top_opportunities": [
    {
      "ticker": "AMD",
      "thesis": "Specific reason AMD is interesting today",
      "play": "Specific options or stock play",
      "conviction": "high"
    }
  ],
  "risk_flags": [
    {
      "flag": "Specific risk to watch today",
      "severity": "medium"
    }
  ],
  "generated_at": "${new Date().toISOString()}"
}

Base all analysis on the real portfolio and market data provided. Be specific, direct, and actionable. No generic advice.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');

  if (start === -1 || end === -1) {
    throw new Error('Invalid autopilot response');
  }

  return JSON.parse(rawText.slice(start, end + 1)) as AutopilotReport;
}
