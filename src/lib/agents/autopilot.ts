import Anthropic from '@anthropic-ai/sdk';
import { getEarningsCalendar, type EarningsCalendarEvent } from '@/lib/api/finnhub';
import { getAccount, getPositions, getOrders } from '@/lib/api/alpaca';
import { getNotableTraderActivity, getTopCongressionalTickers } from '@/lib/api/smartmoney';
import type { CongressionalTrade } from '@/lib/api/smartmoney';
import { getUnusualOptionsFlow, type OptionsFlowSignal } from '@/lib/api/options-flow';
import { runIntelligenceSweep, type IntelligenceSignal } from '@/lib/agents/intelligence';
import { runCongressTracker } from '@/lib/agents/congress-tracker';
import { getStrategyConfig, getStrategyPerformance } from '@/lib/services/strategy';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AutopilotReport {
  date: string;
  market_sentiment: string;
  overall_action: 'aggressive' | 'moderate' | 'defensive' | 'hold';
  report_text: string;
  market_assessment?: string;
  portfolio_assessment?: string;
  opportunities_assessment?: string;
  risk_assessment?: string;
  game_plan?: string;
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

  const [
    earningsResult,
    accountResult,
    positionsResult,
    ordersResult,
    notableTradesResult,
    topCongressTickersResult,
    intelResult,
    congressResult,
    strategyConfigResult,
    strategyPerfResult,
    optionsFlowResult,
  ] = await Promise.allSettled([
    getEarningsCalendar(7),
    getAccount(),
    getPositions(),
    getOrders('all', 20),
    getNotableTraderActivity(),
    getTopCongressionalTickers(5),
    runIntelligenceSweep(),
    runCongressTracker(),
    getStrategyConfig(),
    getStrategyPerformance(),
    getUnusualOptionsFlow(),
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
  const notableTrades =
    notableTradesResult.status === 'fulfilled'
      ? (notableTradesResult.value as CongressionalTrade[])
      : [];
  const topCongressTickers =
    topCongressTickersResult.status === 'fulfilled'
      ? topCongressTickersResult.value
      : [];
  const intelSignals =
    intelResult.status === 'fulfilled'
      ? (intelResult.value as IntelligenceSignal[])
      : [];
  const congressReport =
    congressResult.status === 'fulfilled' ? congressResult.value : null;
  const strategyConfig =
    strategyConfigResult.status === 'fulfilled' ? strategyConfigResult.value : null;
  const strategyPerf =
    strategyPerfResult.status === 'fulfilled' ? strategyPerfResult.value : null;
  const optionsFlow =
    optionsFlowResult.status === 'fulfilled'
      ? (optionsFlowResult.value as OptionsFlowSignal[])
      : [];

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

  const notableTradesContext =
    notableTrades.length > 0
      ? notableTrades
          .slice(0, 5)
          .map(
            (t) =>
              `${t.representative}: ${t.type} ${t.ticker} (${t.amount}) on ${t.transaction_date}`
          )
          .join('\n')
      : 'No notable congressional trades in last 90 days';

  const topCongressTickersContext =
    topCongressTickers.length > 0
      ? topCongressTickers
          .map((t) => `${t.ticker}: ${t.buys} buys ${t.sells} sells`)
          .join(', ')
      : 'No data';

  const intelContext =
    intelSignals.length > 0
      ? intelSignals
          .filter((s) => s.strength === 'high')
          .slice(0, 5)
          .map((s) => `[${s.source}] ${s.headline} — ${s.summary}`)
          .join('\n')
      : 'No high-strength intelligence signals detected';

  const congressContext = congressReport
    ? `Congressional Top 10 Bias: ${congressReport.overall_bias?.toUpperCase()}\nSector Focus: ${congressReport.sector_focus}\n${congressReport.ai_summary}\nTop Follow Plays: ${congressReport.follow_plays?.slice(0, 3).map((p) => `${p.ticker} — ${p.action}`).join(', ')}`
    : 'No congressional tracking data available';

  const strategyContext = strategyConfig
    ? `Strategy: ${strategyConfig.name}\nMax Positions: ${strategyConfig.max_positions}\nMax Position Size: ${strategyConfig.max_position_pct}%\nMin Conviction: ${strategyConfig.min_conviction_score}/10\nRebalance: ${strategyConfig.rebalance_frequency}\nTotal Return: ${strategyPerf?.total_return_pct?.toFixed(2) ?? '0'}%\nAlpha vs ${strategyConfig.benchmark_ticker}: ${strategyPerf?.alpha?.toFixed(2) ?? '0'}%\nOpen Positions: ${strategyPerf?.positions_count ?? 0}/${strategyConfig.max_positions}`
    : 'No strategy configuration available';

  const optionsFlowContext =
    optionsFlow.length > 0
      ? optionsFlow
          .slice(0, 5)
          .map((s) => s.description)
          .join('\n')
      : 'No unusual options flow detected';

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

CONGRESSIONAL SMART MONEY (recent notable trades):
${notableTradesContext}

TOP CONGRESS TICKERS (90 days):
${topCongressTickersContext}

WEB INTELLIGENCE SWEEP (pre-priced signals from Reddit, SEC, news):
${intelContext}

UNUSUAL OPTIONS FLOW (smart money positioning via options):
${optionsFlowContext}

CONGRESSIONAL TOP 10 INTELLIGENCE:
${congressContext}

STRATEGY RULES & PERFORMANCE:
${strategyContext}

Respond with ONLY a valid JSON object. No text before or after. No markdown. Start with { end with }.

{
  "date": "${today}",
  "market_sentiment": "risk_on",
  "overall_action": "moderate",
  "market_assessment": "3-4 sentences about overall market conditions today. Be specific.",
  "portfolio_assessment": "2-3 sentences reviewing open positions and what to do with them today.",
  "opportunities_assessment": "2-3 sentences about top 2-3 tickers worth investigating today.",
  "risk_assessment": "2-3 sentences about key risks and how to protect the portfolio.",
  "game_plan": "4 specific one-sentence actions to take today, separated by | character.",
  "action_items": [
    {
      "priority": "high",
      "action": "Specific action",
      "ticker": "NVDA",
      "rationale": "Specific reason"
    }
  ],
  "positions_review": [
    {
      "ticker": "NVDA",
      "recommendation": "hold",
      "rationale": "Specific rationale",
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
      "flag": "Specific risk to watch",
      "severity": "medium"
    }
  ],
  "generated_at": "${new Date().toISOString()}"
}

Base all analysis on the real portfolio and market data provided. Be specific, direct, and actionable. No generic advice.

Cross-reference congressional activity with your portfolio and watchlist. If congress members are buying tickers you hold or are watching, weight those recommendations higher. Note any alignment between congressional purchases and your open positions.

Factor web intelligence sweep signals into your recommendations. If a ticker appears in both your portfolio/watchlist AND the intelligence sweep, weight it heavily in your action plan.

If congressional follow plays align with your portfolio or watchlist tickers, weight those positions or opportunities higher in your recommendations.

Respect strategy rules: do not recommend exceeding max positions (${strategyConfig?.max_positions ?? 10}) or max position size (${strategyConfig?.max_position_pct ?? 10}%). Only recommend trades meeting minimum conviction score (${strategyConfig?.min_conviction_score ?? 6}/10).`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
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

  const parsed = JSON.parse(rawText.slice(start, end + 1)) as AutopilotReport;

  parsed.report_text = [
    `AUTOPILOT — ${parsed.date}`,
    '',
    parsed.market_assessment || '',
    '',
    parsed.portfolio_assessment || '',
    '',
    parsed.opportunities_assessment || '',
    '',
    parsed.risk_assessment || '',
    '',
    parsed.game_plan
      ? "TODAY'S GAME PLAN:\n" +
        parsed.game_plan
          .split('|')
          .map((a: string) => '• ' + a.trim())
          .join('\n')
      : '',
  ].join('\n');

  return parsed;
}
