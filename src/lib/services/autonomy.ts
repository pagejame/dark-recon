import { createAdminClient } from '@/lib/supabase/admin';
import {
  submitMarketOrder,
  submitLimitOrder,
  placeOptionsOrder,
  getAccount,
} from '@/lib/api/alpaca';
import { createStopLoss } from '@/lib/services/stoploss';
import { logAuditEvent } from '@/lib/services/audit';
import { isTradingBlocked } from '@/lib/services/circuit-breaker';

export interface AutonomyConfig {
  enabled: boolean;
  started_at: string | null;
  ends_at: string | null;
  min_conviction: number;
  max_position_pct: number;
  daily_trade_limit: number;
  days_remaining: number | null;
  trading_mode: 'day_trading' | 'swing_trading';
  profit_target_pct: number;
  profit_target_2_pct: number;
  profit_target_3_pct: number;
  stop_loss_pct: number;
  trailing_stop_pct: number;
  short_selling_enabled: boolean;
  same_day_reentry: boolean;
  max_concurrent_positions: number;
}

interface QueueTradeRow {
  id: string;
  ticker: string;
  instrument_type: string;
  qty: number | null;
  entry_type: string;
  limit_price: number | null;
  options_symbol: string | null;
  contracts: number | null;
  stop_loss_pct: number | null;
  conviction_score: number;
  signal_sources: string[] | null;
  thesis_summary: string;
  key_catalyst: string | null;
  risk_note: string | null;
  strike_price: number | null;
  position_size_pct: number | null;
  dollar_amount: number | null;
  status: string;
}

export async function getAutonomyConfig(): Promise<AutonomyConfig> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [
      'full_autonomy_enabled',
      'autonomy_min_conviction',
      'autonomy_max_position_pct',
      'autonomy_daily_trade_limit',
    ]);

  const settings: Record<string, Record<string, unknown>> = {};
  (data || []).forEach((s: { key: string; value: Record<string, unknown> }) => {
    settings[s.key] = s.value;
  });

  const config = settings['full_autonomy_enabled'] || {};
  const endsAt = config.ends_at ? new Date(config.ends_at as string) : null;
  const daysRemaining = endsAt
    ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    enabled: config.enabled !== false,
    started_at: (config.started_at as string) || null,
    ends_at: (config.ends_at as string) || null,
    min_conviction: (settings['autonomy_min_conviction']?.score as number) || 7,
    max_position_pct: (settings['autonomy_max_position_pct']?.pct as number) || 3,
    daily_trade_limit: (settings['autonomy_daily_trade_limit']?.limit as number) || 100,
    days_remaining: daysRemaining,
    trading_mode: (config.trading_mode as 'day_trading' | 'swing_trading') || 'day_trading',
    profit_target_pct: (config.profit_target_pct as number) || 2,
    profit_target_2_pct: (config.profit_target_2_pct as number) || 5,
    profit_target_3_pct: (config.profit_target_3_pct as number) || 10,
    stop_loss_pct: (config.stop_loss_pct as number) || 1.5,
    trailing_stop_pct: (config.trailing_stop_pct as number) || 1,
    short_selling_enabled: config.short_selling_enabled !== false,
    same_day_reentry: config.same_day_reentry !== false,
    max_concurrent_positions: (config.max_concurrent_positions as number) || 10,
  };
}

export async function enableFullAutonomy(days = 30): Promise<void> {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('settings').upsert(
    {
      key: 'full_autonomy_enabled',
      value: {
        enabled: true,
        started_at: startedAt,
        ends_at: endsAt,
        trading_mode: 'day_trading',
        profit_target_pct: 2,
        profit_target_2_pct: 5,
        profit_target_3_pct: 10,
        stop_loss_pct: 1.5,
        trailing_stop_pct: 1,
        short_selling_enabled: true,
        same_day_reentry: true,
        max_concurrent_positions: 10,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  await supabase.from('settings').upsert(
    {
      key: 'autonomy_daily_trade_limit',
      value: { limit: 100 },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  await supabase.from('settings').upsert(
    {
      key: 'autonomy_min_conviction',
      value: { score: 7 },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  await supabase.from('settings').upsert(
    {
      key: 'autonomy_max_position_pct',
      value: { pct: 3 },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
}

export async function disableFullAutonomy(): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('settings').upsert(
    {
      key: 'full_autonomy_enabled',
      value: { enabled: false, started_at: null, ends_at: null },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
}

export async function getDailyTradeCount(): Promise<number> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'trade_executed')
    .gte('event_at', `${today}T00:00:00Z`);
  return count || 0;
}

export async function executeQueueTrade(
  trade: QueueTradeRow
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const supabase = createAdminClient();

  if (trade.status !== 'pending') {
    return { success: false, error: 'Trade already actioned' };
  }

  if (await isTradingBlocked()) {
    return { success: false, error: 'Circuit breaker active — trading halted' };
  }

  try {
    let order: { id?: string } | undefined;

    if (trade.instrument_type === 'stock') {
      const qty = trade.qty || 1;
      if (trade.entry_type === 'limit' && trade.limit_price) {
        order = await submitLimitOrder({
          symbol: trade.ticker,
          qty,
          side: 'buy',
          limit_price: trade.limit_price,
        });
      } else {
        order = await submitMarketOrder({
          symbol: trade.ticker,
          qty,
          side: 'buy',
        });
      }
    } else if (trade.options_symbol) {
      order = await placeOptionsOrder({
        symbol: trade.options_symbol,
        qty: trade.contracts || 1,
        side: 'buy',
        type: trade.entry_type as 'market' | 'limit',
        limit_price: trade.limit_price || undefined,
      });
    } else {
      return { success: false, error: 'Unsupported instrument type' };
    }

    await supabase
      .from('trade_queue')
      .update({
        status: 'executed',
        alpaca_order_id: order?.id || null,
        executed_at: new Date().toISOString(),
        actioned_at: new Date().toISOString(),
      })
      .eq('id', trade.id);

    if (trade.stop_loss_pct) {
      const positionType =
        trade.instrument_type === 'stock'
          ? 'stock'
          : (trade.instrument_type as 'call' | 'put');
      const entryPrice = trade.limit_price || trade.strike_price || 0;
      await createStopLoss({
        ticker: trade.ticker,
        position_type: positionType,
        entry_price: entryPrice,
        stop_pct: trade.stop_loss_pct / 100,
      });
    }

    await supabase.from('trade_journal').insert({
      ticker: trade.ticker,
      position_type: trade.instrument_type,
      thesis: trade.thesis_summary,
      signal_source: 'Autonomous Execution',
      entry_notes: `Full autonomy execution. Catalyst: ${trade.key_catalyst}. Risk: ${trade.risk_note}`,
      created_at: new Date().toISOString(),
    });

    await supabase.from('strategy_decisions').insert({
      decision_type: 'entry',
      ticker: trade.ticker,
      rationale: trade.thesis_summary,
      conviction_score: trade.conviction_score,
      signal_source: 'Autonomous Execution',
      action_taken: true,
      decision_date: new Date().toISOString(),
    });

    const account = await getAccount();
    const equity = parseFloat((account as { equity?: string })?.equity || '100000');
    const qty = trade.qty || trade.contracts || 1;
    const price = trade.limit_price || trade.strike_price || 0;

    await logAuditEvent({
      event_type: 'trade_executed',
      ticker: trade.ticker,
      action_taken: `AUTONOMOUS BUY: ${qty} ${trade.ticker} @ ${trade.entry_type === 'limit' ? `$${trade.limit_price} limit` : 'market'}`,
      price_at_action: price || undefined,
      quantity: qty,
      dollar_amount: trade.dollar_amount || price * qty,
      rationale: `Full autonomy execution. ${trade.thesis_summary} | Catalyst: ${trade.key_catalyst}`,
      signal_sources: trade.signal_sources || [],
      conviction_score: trade.conviction_score,
      portfolio_value_at_action: equity,
      outcome: 'pending',
      source: 'system',
    });

    return { success: true, orderId: order?.id };
  } catch (e) {
    await supabase
      .from('trade_queue')
      .update({
        status: 'failed',
        rejection_reason: e instanceof Error ? e.message : 'Execution failed',
      })
      .eq('id', trade.id);

    return { success: false, error: e instanceof Error ? e.message : 'Execution failed' };
  }
}

export async function autoExecutePendingTrades(options?: {
  earningsOnly?: boolean;
  minConvictionOverride?: number;
}): Promise<string[]> {
  const autonomy = await getAutonomyConfig();
  if (!autonomy.enabled) return [];

  if (await isTradingBlocked()) return [];

  const dailyTrades = await getDailyTradeCount();
  const remaining = autonomy.daily_trade_limit - dailyTrades;
  if (remaining <= 0) return [];

  const supabase = createAdminClient();
  const minConviction = options?.minConvictionOverride ?? autonomy.min_conviction;

  const { data: pendingTrades } = await supabase
    .from('trade_queue')
    .select('*')
    .eq('status', 'pending')
    .gte('conviction_score', minConviction)
    .order('conviction_score', { ascending: false })
    .limit(remaining * 2);

  const executed: string[] = [];

  for (const trade of (pendingTrades || []) as QueueTradeRow[]) {
    if (executed.length >= remaining) break;

    if (options?.earningsOnly) {
      const sources = trade.signal_sources || [];
      const isEarnings = sources.some((s) => s.includes('Earnings Catalyst'));
      if (!isEarnings) continue;
    } else {
      const sources = trade.signal_sources || [];
      const isEarnings = sources.some((s) => s.includes('Earnings Catalyst'));
      if (isEarnings) continue;
    }

    if ((trade.position_size_pct || 0) > autonomy.max_position_pct * 1.5) {
      console.log(
        `Skipping ${trade.ticker} — position size ${trade.position_size_pct}% exceeds limit`
      );
      continue;
    }

    const result = await executeQueueTrade(trade);
    if (result.success) {
      executed.push(trade.ticker);
    } else {
      console.error(`Auto-execute failed for ${trade.ticker}:`, result.error);
    }
  }

  return executed;
}

export async function executeQueueTradeByTicker(ticker: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: trade } = await supabase
    .from('trade_queue')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .eq('status', 'pending')
    .order('conviction_score', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!trade) return false;
  const result = await executeQueueTrade(trade as QueueTradeRow);
  return result.success;
}
