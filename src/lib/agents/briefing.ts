import Anthropic from '@anthropic-ai/sdk';
import { getMacroSnapshot } from '@/lib/api/fred';
import { getPreMarketData, type PreMarketData } from '@/lib/api/premarket';
import { getPositions, getOrders } from '@/lib/api/alpaca';

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
  pre_market?: PreMarketData;
  limit_order_assessments?: string[];
  pre_market_assessment?: string;
}

interface AlpacaPosition {
  symbol: string;
}

interface AlpacaOrder {
  symbol: string;
  side: string;
  qty: string;
  limit_price?: string;
  type: string;
  status: string;
}

export async function generateMorningBriefing(): Promise<MorningBriefing> {
  const today = new Date().toDateString();
  const hour = new Date().getHours();
  const marketStatus = hour >= 9 && hour < 16 ? 'open' : 'closed';

  let currentPositionTickers: string[] = [];
  let pendingOrders: AlpacaOrder[] = [];
  let preMarketData: PreMarketData | null = null;

  const [positionsResult, macroResult, ordersResult] = await Promise.allSettled([
    getPositions(),
    getMacroSnapshot(),
    getOrders('open', 50),
  ]);

  if (positionsResult.status === 'fulfilled') {
    currentPositionTickers = (positionsResult.value as AlpacaPosition[]).map((p) => p.symbol);
  }

  if (ordersResult.status === 'fulfilled') {
    pendingOrders = (ordersResult.value as AlpacaOrder[]).filter(
      (o) => o.type === 'limit' && ['new', 'accepted', 'pending_new', 'open'].includes(o.status)
    );
  }

  const preMarketResult = await Promise.allSettled([getPreMarketData(currentPositionTickers)]);
  if (preMarketResult[0].status === 'fulfilled') {
    preMarketData = preMarketResult[0].value;
  }

  const macroCtx =
    macroResult.status === 'fulfilled'
      ? `
MACRO BACKDROP (Federal Reserve Data):
Regime: ${macroResult.value.macro_regime.toUpperCase()}
${macroResult.value.market_backdrop}
`
      : 'Macro data unavailable';

  const preMarketCtx =
    preMarketData != null
      ? `
OVERNIGHT & PRE-MARKET:
Market Bias: ${preMarketData.futures.bias.toUpperCase()}
${preMarketData.futures.summary}

POSITION NEWS SINCE LAST CLOSE:
${
  preMarketData.position_news.length > 0
    ? preMarketData.position_news.map((n) => `${n.ticker}: ${n.headline}`).join('\n')
    : 'No significant news on open positions overnight'
}
`
      : 'Pre-market data unavailable';

  const limitOrderContext = `
PENDING LIMIT ORDERS (check fill likelihood at open):
${
  pendingOrders.length > 0
    ? pendingOrders
        .map(
          (o) =>
            `${o.symbol}: ${o.side.toUpperCase()} ${o.qty} @ $${o.limit_price} — ${o.type}`
        )
        .join('\n')
    : 'No pending limit orders'
}
`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Morning Briefing Agent. Today is ${today}. Market is currently ${marketStatus}.

${macroCtx}

${preMarketCtx}

${limitOrderContext}

OPEN POSITIONS: ${currentPositionTickers.join(', ') || 'None'}

Generate a sharp pre-market intelligence briefing incorporating the overnight data above.

Requirements:
- Include a dedicated MACRO section analyzing the economic backdrop (Fed policy, rates, yield curve, unemployment) and what it means for today's trading posture
- Include a dedicated pre-market assessment paragraph analyzing overnight bias (${preMarketData?.futures.bias || 'unknown'}) and what it means for today's session
- Reference any position-specific news that could affect today's trades on open positions
- For each pending limit order, assess whether the price is likely to fill at open based on overnight movement and pre-market sentiment. Include these assessments in limit_order_assessments array.
- Map overnight bias to sentiment: bullish -> risk_on, bearish -> risk_off, neutral -> neutral

Respond with a single JSON object only. No text before or after. No markdown. No code fences. Just raw JSON starting with { and ending with }.

{
  "date": "${today}",
  "market_status": "${marketStatus}",
  "sentiment": "risk_on",
  "briefing_text": "DARK RECON — ${today}\\n\\n[Paragraph 1: MACRO — economic regime, Fed backdrop, rates/yield curve read, sector implications for today]\\n\\n[Paragraph 2: Pre-market assessment — overnight futures bias, SPY/QQQ movement, risk-on or risk-off read for the open]\\n\\n[Paragraph 3: Overall market condition and what it means for today — 3-4 sentences, specific and direct]\\n\\n[Paragraph 4: Top 2-3 opportunities with specific tickers and setups — be actionable]\\n\\n[Paragraph 5: Key risks and levels to watch — what invalidates the thesis]\\n\\n[Paragraph 6: Limit order fill outlook — which pending orders likely fill at open and why]\\n\\n[Paragraph 7: One clear tactical recommendation for the session]",
  "top_signals": ["NVDA +2.3%", "AMD momentum", "SPY holding 520"],
  "key_levels": [
    { "label": "SPY Support", "value": "520", "note": "Key level to hold" },
    { "label": "SPY Resistance", "value": "535", "note": "Breakout target" },
    { "label": "VIX", "value": "18", "note": "Elevated caution" },
    { "label": "10Y Yield", "value": "4.4%", "note": "Watch for moves" }
  ],
  "pre_market_assessment": "One paragraph summary of overnight action and open setup",
  "limit_order_assessments": ["AAPL buy 10 @ $180 — likely to fill, gapped above limit on bullish overnight"],
  "generated_at": "${new Date().toISOString()}"
}

Make the briefing_text sharp, direct, and specific. Like a hedge fund analyst. Use real market knowledge. No fluff.`,
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
    console.error('Briefing raw response:', rawText);
    throw new Error('Could not find valid JSON in briefing response');
  }

  const jsonStr = rawText.slice(start, end + 1);
  const result = JSON.parse(jsonStr) as MorningBriefing;

  if (preMarketData) {
    result.pre_market = preMarketData;
  }

  return result;
}
