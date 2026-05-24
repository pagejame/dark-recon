import Anthropic from '@anthropic-ai/sdk';
import { getAccount, getPositions } from '@/lib/api/alpaca';
import { getStrategyConfig } from '@/lib/services/strategy';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface QueuedTrade {
  ticker: string;
  direction: 'long' | 'short';
  instrument_type: 'stock' | 'call' | 'put';
  qty?: number;
  entry_type: 'market' | 'limit';
  limit_price?: number;
  options_symbol?: string;
  strike_price?: number;
  expiration_date?: string;
  contracts?: number;
  position_size_pct: number;
  dollar_amount: number;
  stop_loss_price?: number;
  stop_loss_pct: number;
  conviction_score: number;
  signal_sources: string[];
  thesis_summary: string;
  key_catalyst: string;
  risk_note: string;
  expires_at: string;
}

interface SignalRow {
  ticker: string;
  signal_type: string;
  summary: string;
}

interface IntelRow {
  ticker: string | null;
  source: string;
  headline: string;
}

interface AlpacaPositionRow {
  symbol: string;
}

export async function buildTradeQueue(): Promise<QueuedTrade[]> {
  const supabase = createAdminClient();

  const [account, positions, config] = await Promise.all([
    getAccount(),
    getPositions(),
    getStrategyConfig(),
  ]);

  if (!account || !config) return [];

  const equity = parseFloat(account.equity || '100000');
  const currentPositions = (positions as AlpacaPositionRow[]).map((p) => p.symbol);
  const positionCount = currentPositions.length;
  const maxPositions = config.max_positions || 10;
  const availableSlots = maxPositions - positionCount;

  if (availableSlots <= 0) return [];

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();

  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .eq('strength', 'high')
    .gte('created_at', startOfDay)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: autopilotReport } = await supabase
    .from('autopilot_reports')
    .select('*')
    .gte('created_at', startOfDay)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: intelSignals } = await supabase
    .from('intelligence_signals')
    .select('*')
    .eq('strength', 'high')
    .gte('swept_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(10);

  const { data: existingQueue } = await supabase
    .from('trade_queue')
    .select('ticker')
    .in('status', ['pending', 'approved'])
    .gte('queued_at', startOfDay);

  const queuedTickers = (existingQueue || []).map((q: { ticker: string }) => q.ticker);

  const signalContext = ((signals || []) as SignalRow[])
    .filter((s) => !currentPositions.includes(s.ticker) && !queuedTickers.includes(s.ticker))
    .slice(0, 10)
    .map((s) => `${s.ticker}: ${s.signal_type} — ${s.summary}`)
    .join('\n');

  const intelContext = ((intelSignals || []) as IntelRow[])
    .filter((s) => s.ticker && !currentPositions.includes(s.ticker))
    .slice(0, 5)
    .map((s) => `${s.ticker}: [${s.source}] ${s.headline}`)
    .join('\n');

  const autopilotContext = autopilotReport
    ? `Autopilot opportunities: ${JSON.stringify(autopilotReport.top_opportunities || []).slice(0, 500)}`
    : 'No autopilot report today';

  const portfolioContext = `
Portfolio: $${equity.toLocaleString()}
Open positions (${positionCount}/${maxPositions}): ${currentPositions.join(', ') || 'None'}
Available slots: ${availableSlots}
Max position size: ${config.max_position_pct}% ($${((equity * config.max_position_pct) / 100).toFixed(0)})
Min conviction required: ${config.min_conviction_score}/10
`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Trade Queue Agent. Build a queue of pre-sized trades ready for one-tap approval.

PORTFOLIO STATE:
${portfolioContext}

HIGH CONVICTION SIGNALS TODAY:
${signalContext || 'No high conviction signals yet'}

INTELLIGENCE SWEEP SIGNALS:
${intelContext || 'No intelligence signals'}

${autopilotContext}

RULES FOR QUEUING A TRADE:
1. Only queue if conviction score would be 8+ based on signal convergence
2. Never queue a ticker already in the portfolio or existing queue
3. Maximum ${Math.min(availableSlots, 3)} trades in the queue at once
4. Position size: 3% of portfolio for medium conviction, 5% for high conviction
5. Always include a specific stop loss level
6. Prefer stocks with upcoming catalysts (earnings, FDA, contracts)
7. Options plays only when conviction is 9+

Return ONLY a valid JSON array. No markdown. Start with [ end with ].
Return empty array [] if no trades meet the criteria.

[
  {
    "ticker": "NVDA",
    "direction": "long",
    "instrument_type": "stock",
    "qty": 23,
    "entry_type": "limit",
    "limit_price": 215.00,
    "position_size_pct": 5.0,
    "dollar_amount": 4945.00,
    "stop_loss_price": 200.00,
    "stop_loss_pct": 7.0,
    "conviction_score": 9,
    "signal_sources": ["Market Scanner — momentum_breakout", "Intelligence — Reddit bullish sentiment"],
    "thesis_summary": "NVDA breaking out on AI infrastructure demand with Blackwell GPU cycle accelerating. Two confirming signals with earnings catalyst May 28.",
    "key_catalyst": "NVDA earnings May 28 — expected beat on data center revenue",
    "risk_note": "Stop at $200 limits loss to ~$345 on this position. AI capex slowdown is the primary risk."
  }
]

Be selective. Quality over quantity. Only queue trades you would stake real money on.`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');

  if (start === -1 || end === -1) return [];

  const trades = JSON.parse(raw.slice(start, end + 1)) as QueuedTrade[];

  const marketClose = new Date();
  marketClose.setHours(20, 0, 0, 0);
  const expiresAt = marketClose.toISOString();

  return trades.map((t) => ({ ...t, expires_at: expiresAt }));
}

export async function saveTradeQueue(trades: QueuedTrade[]): Promise<void> {
  if (trades.length === 0) return;
  const supabase = createAdminClient();
  for (const trade of trades) {
    try {
      await supabase.from('trade_queue').insert({
        ...trade,
        status: 'pending',
        queued_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save queued trade:', e);
    }
  }
}
