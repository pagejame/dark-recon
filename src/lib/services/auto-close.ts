import { createAdminClient } from '@/lib/supabase/admin';
import { getPositions } from '@/lib/api/alpaca';

const ALPACA_BASE = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

interface PositionAlertRow {
  id: string;
  ticker: string;
  current_price: number;
  trigger_price: number | null;
}

interface AlpacaPositionRow {
  symbol: string;
  qty?: string;
  unrealized_plpc?: string;
  unrealized_pl?: string;
  market_value?: string;
}

async function closeAlpacaPosition(
  ticker: string
): Promise<{ success: boolean; order_id?: string; error?: string }> {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/positions/${encodeURIComponent(ticker)}`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: (err as { message?: string }).message || `Close failed: ${res.status}`,
      };
    }

    const order = await res.json();
    return { success: true, order_id: order.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export interface AutoCloseResult {
  ticker: string;
  action: 'closed' | 'queued' | 'skipped';
  reason: string;
  order_id?: string;
  pnl_at_close?: number;
}

export async function runAutoClose(autoExecute: boolean = false): Promise<AutoCloseResult[]> {
  const supabase = createAdminClient();
  const results: AutoCloseResult[] = [];

  const { data: triggeredAlerts } = await supabase
    .from('position_alerts')
    .select('*')
    .eq('alert_type', 'stop_loss')
    .eq('severity', 'critical')
    .eq('status', 'active')
    .gte('fired_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

  if (!triggeredAlerts || triggeredAlerts.length === 0) {
    return results;
  }

  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isMarketHours = day >= 1 && day <= 5 && hour >= 13 && hour < 20;

  if (!isMarketHours) {
    return (triggeredAlerts as PositionAlertRow[]).map((a) => ({
      ticker: a.ticker,
      action: 'skipped' as const,
      reason: 'Market closed — will execute at next open if stop still breached',
    }));
  }

  const positions = await getPositions();
  const positionMap: Record<string, AlpacaPositionRow> = {};
  (positions || []).forEach((p: AlpacaPositionRow) => {
    positionMap[p.symbol] = p;
  });

  for (const alert of triggeredAlerts as PositionAlertRow[]) {
    const ticker = alert.ticker;
    const position = positionMap[ticker];

    if (!position) {
      await supabase.from('position_alerts').update({ status: 'actioned' }).eq('id', alert.id);
      continue;
    }

    const pnlPct = parseFloat(position.unrealized_plpc || '0') * 100;
    const pnlDollar = parseFloat(position.unrealized_pl || '0');

    if (autoExecute) {
      const closeResult = await closeAlpacaPosition(ticker);

      if (closeResult.success) {
        const { error: journalError } = await supabase.from('trade_journal').insert({
          ticker,
          position_type: 'stock',
          thesis: `Auto-close: Stop loss breached at $${alert.current_price}`,
          signal_source: 'Auto-Close Agent',
          entry_notes: `Stop loss auto-executed. P&L at close: ${pnlPct.toFixed(2)}% ($${pnlDollar.toFixed(0)})`,
          result: pnlPct >= 0 ? 'win' : 'loss',
          created_at: new Date().toISOString(),
        });
        if (journalError) console.error('Auto-close journal error:', journalError);

        const { error: decisionError } = await supabase.from('strategy_decisions').insert({
          decision_type: 'exit',
          ticker,
          rationale: `Auto-close: Stop loss breached. Exit at $${alert.current_price} with ${pnlPct.toFixed(2)}% P&L.`,
          action_taken: true,
          decision_date: new Date().toISOString(),
        });
        if (decisionError) console.error('Auto-close decision error:', decisionError);

        await supabase.from('position_alerts').update({ status: 'actioned' }).eq('id', alert.id);

        results.push({
          ticker,
          action: 'closed',
          reason: `Stop loss breached at $${alert.current_price}. Position closed automatically.`,
          order_id: closeResult.order_id,
          pnl_at_close: pnlDollar,
        });
      } else {
        results.push({
          ticker,
          action: 'skipped',
          reason: `Auto-close failed: ${closeResult.error}`,
        });
      }
    } else {
      const { data: existingQueue } = await supabase
        .from('trade_queue')
        .select('id')
        .eq('ticker', ticker)
        .eq('status', 'pending')
        .maybeSingle();

      if (!existingQueue) {
        const marketClose = new Date();
        marketClose.setHours(20, 0, 0, 0);

        const { error: queueError } = await supabase.from('trade_queue').insert({
          ticker,
          direction: 'long',
          instrument_type: 'stock',
          qty: Math.floor(parseFloat(position.qty || '0')),
          entry_type: 'market',
          position_size_pct: 0,
          dollar_amount: parseFloat(position.market_value || '0'),
          stop_loss_pct: 0,
          conviction_score: 10,
          signal_sources: ['Auto-Close — Stop Loss Breached'],
          thesis_summary: `STOP LOSS BREACHED — ${ticker} at $${alert.current_price} (below stop of $${alert.trigger_price}). Close position immediately.`,
          key_catalyst: `Stop loss triggered. Current P&L: ${pnlPct.toFixed(2)}% ($${pnlDollar.toFixed(0)})`,
          risk_note: 'Immediate action required — holding below stop increases losses',
          status: 'pending',
          queued_at: new Date().toISOString(),
          expires_at: marketClose.toISOString(),
        });
        if (queueError) console.error('Auto-close queue error:', queueError);
      }

      results.push({
        ticker,
        action: 'queued',
        reason: 'Stop breached — close queued for approval in Trade Queue',
        pnl_at_close: pnlDollar,
      });
    }
  }

  return results;
}
