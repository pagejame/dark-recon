import { createAdminClient } from '@/lib/supabase/admin';
import { getAutonomyConfig } from './autonomy';

const ALPACA_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

export interface ProfitTargetCheck {
  ticker: string;
  current_price: number;
  entry_price: number;
  pnl_pct: number;
  action: 'hold' | 'take_partial' | 'take_full' | 'trail_stop';
  reason: string;
  order_id?: string;
}

async function placeClosingOrder(
  ticker: string,
  qty: string,
  side: 'sell' | 'buy'
): Promise<string | null> {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: ticker,
        qty,
        side,
        type: 'market',
        time_in_force: 'day',
      }),
    });
    if (!res.ok) return null;
    const order = await res.json();
    return order.id || null;
  } catch {
    return null;
  }
}

export async function checkAndExecuteProfitTargets(): Promise<ProfitTargetCheck[]> {
  const results: ProfitTargetCheck[] = [];

  try {
    const [config, posRes] = await Promise.all([
      getAutonomyConfig(),
      fetch(`${ALPACA_BASE}/v2/positions`, {
        headers: {
          'APCA-API-KEY-ID': ALPACA_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET,
        },
      }),
    ]);

    if (!posRes.ok) return results;
    const positions = await posRes.json();
    if (!Array.isArray(positions) || positions.length === 0) return results;

    const supabase = createAdminClient();

    for (const position of positions) {
      const ticker = position.symbol;
      const currentPrice = parseFloat(position.current_price || '0');
      const entryPrice = parseFloat(position.avg_entry_price || '0');
      const qty = parseFloat(position.qty || '0');
      const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
      const isLong = parseFloat(position.qty) > 0;
      const adjustedPnl = isLong ? pnlPct : -pnlPct;

      let action: ProfitTargetCheck['action'] = 'hold';
      let reason = '';
      let orderId: string | undefined;

      if (adjustedPnl >= config.profit_target_pct && adjustedPnl < config.profit_target_2_pct) {
        const { data: existingAction } = await supabase
          .from('audit_log')
          .select('id')
          .eq('ticker', ticker)
          .eq('event_type', 'trade_executed')
          .ilike('action_taken', '%PARTIAL PROFIT%')
          .gte('event_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!existingAction) {
          const halfQty = Math.floor(Math.abs(qty) / 2).toString();
          if (parseInt(halfQty, 10) > 0) {
            orderId =
              (await placeClosingOrder(ticker, halfQty, isLong ? 'sell' : 'buy')) || undefined;
            if (orderId) {
              action = 'take_partial';
              reason = `+${adjustedPnl.toFixed(2)}% hit profit target 1 (+${config.profit_target_pct}%) — sold 50% to lock gains`;

              try {
                await supabase.from('audit_log').insert({
                  event_type: 'trade_executed',
                  ticker,
                  action_taken: `PARTIAL PROFIT TAKE: ${ticker} at $${currentPrice} (+${adjustedPnl.toFixed(2)}%)`,
                  rationale: reason,
                  price_at_action: currentPrice,
                  quantity: parseFloat(halfQty),
                  pnl_pct: adjustedPnl,
                  outcome: 'win',
                  source: 'system',
                  event_at: new Date().toISOString(),
                });
              } catch (e) {
                console.error('Audit log error:', e);
              }
            }
          }
        }
      }

      if (adjustedPnl >= config.profit_target_2_pct && adjustedPnl < config.profit_target_3_pct) {
        orderId =
          (await placeClosingOrder(ticker, Math.abs(qty).toString(), isLong ? 'sell' : 'buy')) ||
          undefined;
        if (orderId) {
          action = 'take_full';
          reason = `+${adjustedPnl.toFixed(2)}% hit profit target 2 (+${config.profit_target_2_pct}%) — full position closed`;

          try {
            await supabase.from('audit_log').insert({
              event_type: 'position_closed',
              ticker,
              action_taken: `PROFIT TARGET 2 HIT: ${ticker} closed at $${currentPrice} (+${adjustedPnl.toFixed(2)}%)`,
              rationale: reason,
              price_at_action: currentPrice,
              pnl_pct: adjustedPnl,
              outcome: 'win',
              source: 'system',
              event_at: new Date().toISOString(),
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }
      }

      if (adjustedPnl >= config.profit_target_3_pct) {
        orderId =
          (await placeClosingOrder(ticker, Math.abs(qty).toString(), isLong ? 'sell' : 'buy')) ||
          undefined;
        if (orderId) {
          action = 'take_full';
          reason = `+${adjustedPnl.toFixed(2)}% hit profit target 3 (+${config.profit_target_3_pct}%) — RUNNER closed, maximum gain captured`;

          try {
            await supabase.from('audit_log').insert({
              event_type: 'position_closed',
              ticker,
              action_taken: `PROFIT TARGET 3 HIT (RUNNER): ${ticker} at $${currentPrice} (+${adjustedPnl.toFixed(2)}%)`,
              rationale: reason,
              price_at_action: currentPrice,
              pnl_pct: adjustedPnl,
              outcome: 'win',
              source: 'system',
              event_at: new Date().toISOString(),
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }
      }

      if (adjustedPnl <= -config.stop_loss_pct && action === 'hold') {
        orderId =
          (await placeClosingOrder(ticker, Math.abs(qty).toString(), isLong ? 'sell' : 'buy')) ||
          undefined;
        if (orderId) {
          action = 'take_full';
          reason = `${adjustedPnl.toFixed(2)}% hit intraday stop (-${config.stop_loss_pct}%) — position cut`;

          try {
            await supabase.from('audit_log').insert({
              event_type: 'position_closed',
              ticker,
              action_taken: `STOP LOSS HIT: ${ticker} closed at $${currentPrice} (${adjustedPnl.toFixed(2)}%)`,
              rationale: reason,
              price_at_action: currentPrice,
              pnl_pct: adjustedPnl,
              outcome: 'loss',
              source: 'system',
              event_at: new Date().toISOString(),
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }
      }

      if (adjustedPnl >= 1 && action === 'hold') {
        const trailPrice = isLong
          ? currentPrice * (1 - config.trailing_stop_pct / 100)
          : currentPrice * (1 + config.trailing_stop_pct / 100);

        reason = `Position +${adjustedPnl.toFixed(2)}% — trailing stop active at $${trailPrice.toFixed(2)} (${config.trailing_stop_pct}% trail)`;
        action = 'trail_stop';

        try {
          await supabase.from('position_alerts').insert({
            ticker,
            alert_type: 'trailing_stop',
            message: `Trailing stop at $${trailPrice.toFixed(2)} — locking in profits`,
            severity: 'info',
            current_price: currentPrice,
            trigger_price: trailPrice,
            status: 'active',
            fired_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Trailing stop alert error:', e);
        }
      }

      results.push({
        ticker,
        current_price: currentPrice,
        entry_price: entryPrice,
        pnl_pct: adjustedPnl,
        action,
        reason,
        order_id: orderId,
      });
    }
  } catch (e) {
    console.error('Profit target check error:', e);
  }

  return results;
}
