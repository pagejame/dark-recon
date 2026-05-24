import { getPositions, getAccount, submitMarketOrder } from '@/lib/api/alpaca';
import { getStrategyConfig } from '@/lib/services/strategy';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAutonomyConfig } from '@/lib/services/autonomy';
import { logAuditEvent } from '@/lib/services/audit';

export interface RebalanceAction {
  ticker: string;
  action: 'trim' | 'close' | 'hold';
  reason: string;
  current_pct: number;
  target_pct: number;
  shares_to_sell?: number;
  dollar_amount?: number;
  urgency: 'immediate' | 'this_week' | 'monitor';
}

interface AlpacaPositionRow {
  symbol: string;
  market_value?: string;
  unrealized_plpc?: string;
  qty?: string;
  avg_entry_price?: string;
  current_price?: string;
}

const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

export async function runRebalanceCheck(): Promise<RebalanceAction[]> {
  const [positions, account, config] = await Promise.all([
    getPositions(),
    getAccount(),
    getStrategyConfig(),
  ]);

  if (!positions || positions.length === 0 || !account || !config) return [];

  const equity = parseFloat(account.equity || '100000');
  const maxPositionPct = config.max_position_pct || 10;
  const actions: RebalanceAction[] = [];

  const positionData = (positions as AlpacaPositionRow[]).map((p) => {
    const marketValue = parseFloat(p.market_value || '0');
    const currentPct = (marketValue / equity) * 100;
    const pnlPct = parseFloat(p.unrealized_plpc || '0') * 100;
    const ticker = p.symbol;
    const isOptions = OCC_SYMBOL.test(ticker);

    return {
      ticker,
      marketValue,
      currentPct,
      pnlPct,
      qty: parseFloat(p.qty || '0'),
      entryPrice: parseFloat(p.avg_entry_price || '0'),
      currentPrice: parseFloat(p.current_price || '0'),
      isOptions,
    };
  });

  for (const pos of positionData) {
    if (pos.isOptions) continue;

    if (pos.currentPct > maxPositionPct * 1.2) {
      const targetValue = equity * (maxPositionPct / 100);
      const excessValue = pos.marketValue - targetValue;
      const sharesToSell = Math.floor(excessValue / pos.currentPrice);

      if (sharesToSell > 0) {
        actions.push({
          ticker: pos.ticker,
          action: 'trim',
          reason: `Position at ${pos.currentPct.toFixed(1)}% of portfolio — exceeds ${maxPositionPct}% max. Trim ${sharesToSell} shares to bring back to target.`,
          current_pct: pos.currentPct,
          target_pct: maxPositionPct,
          shares_to_sell: sharesToSell,
          dollar_amount: excessValue,
          urgency: pos.currentPct > maxPositionPct * 1.5 ? 'immediate' : 'this_week',
        });
      }
    }

    if (pos.currentPct < 1.0 && pos.pnlPct < -5) {
      actions.push({
        ticker: pos.ticker,
        action: 'close',
        reason: `Position at only ${pos.currentPct.toFixed(1)}% of portfolio and down ${Math.abs(pos.pnlPct).toFixed(1)}%. Too small to recover meaningfully — free up capital.`,
        current_pct: pos.currentPct,
        target_pct: 0,
        shares_to_sell: pos.qty,
        dollar_amount: pos.marketValue,
        urgency: 'this_week',
      });
    }

    if (pos.currentPct > maxPositionPct * 0.85 && pos.currentPct <= maxPositionPct * 1.2) {
      actions.push({
        ticker: pos.ticker,
        action: 'hold',
        reason: `Position at ${pos.currentPct.toFixed(1)}% — approaching ${maxPositionPct}% max. Monitor — do not add more.`,
        current_pct: pos.currentPct,
        target_pct: maxPositionPct,
        urgency: 'monitor',
      });
    }
  }

  const supabase = createAdminClient();
  const marketClose = new Date();
  marketClose.setHours(20, 0, 0, 0);
  const autonomy = await getAutonomyConfig();

  for (const action of actions.filter((a) => a.action !== 'hold' && a.urgency === 'immediate')) {
    if (action.action === 'trim' && autonomy.enabled && action.shares_to_sell) {
      try {
        await submitMarketOrder({
          symbol: action.ticker,
          qty: action.shares_to_sell,
          side: 'sell',
        });

        await logAuditEvent({
          event_type: 'rebalance_triggered',
          ticker: action.ticker,
          action_taken: `AUTONOMOUS REBALANCE: Sold ${action.shares_to_sell} ${action.ticker} to reduce from ${action.current_pct.toFixed(1)}% to ${action.target_pct}%`,
          rationale: action.reason,
          quantity: action.shares_to_sell,
          dollar_amount: action.dollar_amount,
          outcome: 'not_applicable',
          source: 'system',
        });
        continue;
      } catch (e) {
        console.error(`Auto-rebalance failed for ${action.ticker}:`, e);
      }
    }

    const { data: existing } = await supabase
      .from('trade_queue')
      .select('id')
      .eq('ticker', action.ticker)
      .in('status', ['pending'])
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('trade_queue').insert({
        ticker: action.ticker,
        direction: 'long',
        instrument_type: 'stock',
        qty: action.shares_to_sell,
        entry_type: 'market',
        position_size_pct: action.current_pct,
        dollar_amount: action.dollar_amount || 0,
        stop_loss_pct: 0,
        conviction_score: 8,
        signal_sources: ['Auto-Rebalance — Position size exceeded strategy rules'],
        thesis_summary: action.reason,
        key_catalyst: 'Portfolio rebalancing — maintain strategy discipline',
        risk_note: 'Rebalance trade — reduces concentration risk',
        status: 'pending',
        queued_at: new Date().toISOString(),
        expires_at: marketClose.toISOString(),
      });
      if (error) console.error('Rebalance queue insert error:', error);
    }
  }

  for (const action of actions) {
    const { error } = await supabase.from('strategy_decisions').insert({
      decision_type: action.action === 'hold' ? 'hold' : 'rebalance',
      ticker: action.ticker,
      rationale: action.reason,
      action_taken: action.urgency === 'immediate',
      decision_date: new Date().toISOString(),
    });
    if (error) console.error('Rebalance decision log error:', error);
  }

  return actions;
}
