import { getPositions } from '@/lib/api/alpaca';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateExitLogic, type ExitSignal } from '@/lib/services/exit-logic';

export interface PositionAlert {
  ticker: string;
  alert_type:
    | 'stop_loss'
    | 'take_profit'
    | 'trailing_stop'
    | 'time_decay'
    | 'drawdown_warning'
    | 'momentum_loss'
    | 'thesis_break';
  message: string;
  severity: 'critical' | 'warning' | 'info';
  current_price: number;
  trigger_price?: number;
  position_pnl_pct: number;
}

interface AlpacaPositionRow {
  symbol: string;
  current_price?: string;
  avg_entry_price?: string;
  unrealized_plpc?: string;
  unrealized_pl?: string;
}

interface StopAlertRow {
  target_price: number;
}

const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

function exitSignalToAlert(signal: ExitSignal): PositionAlert {
  const alertTypeMap: Record<ExitSignal['exit_type'], PositionAlert['alert_type']> = {
    trailing_stop: 'trailing_stop',
    momentum_loss: 'momentum_loss',
    time_stop: 'time_decay',
    thesis_break: 'thesis_break',
    intraday_reversal: 'drawdown_warning',
  };

  const severity =
    signal.urgency === 'immediate'
      ? 'critical'
      : signal.exit_type === 'time_stop'
        ? 'warning'
        : 'warning';

  const actionLabel =
    signal.action === 'close_half' ? 'Close 50%' : 'Close full position';

  return {
    ticker: signal.ticker,
    alert_type: alertTypeMap[signal.exit_type],
    message: `🚨 EXIT [${signal.exit_type.toUpperCase()}] — ${signal.ticker}: ${signal.reason} → ${actionLabel}`,
    severity,
    current_price: signal.current_price,
    position_pnl_pct: signal.pnl_pct,
  };
}

export async function runPositionMonitor(): Promise<{
  alerts_fired: number;
  positions_checked: number;
  alerts: PositionAlert[];
}> {
  const supabase = createAdminClient();

  const positions = (await getPositions()) as AlpacaPositionRow[];

  if (!positions || positions.length === 0) {
    return { alerts_fired: 0, positions_checked: 0, alerts: [] };
  }

  const alerts: PositionAlert[] = [];

  for (const position of positions) {
    const ticker = position.symbol;
    const currentPrice = parseFloat(position.current_price || '0');
    const pnlPct = parseFloat(position.unrealized_plpc || '0') * 100;
    const pnlDollar = parseFloat(position.unrealized_pl || '0');

    const isOptions = OCC_SYMBOL.test(ticker);
    const underlying = isOptions ? ticker.replace(/\d.*/, '') : ticker;

    const { data: stopAlerts } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('ticker', underlying)
      .eq('status', 'active')
      .eq('condition', 'below');

    for (const stopAlert of (stopAlerts || []) as StopAlertRow[]) {
      if (currentPrice <= stopAlert.target_price * 1.02) {
        const isBreach = currentPrice <= stopAlert.target_price;
        alerts.push({
          ticker,
          alert_type: 'stop_loss',
          message: isBreach
            ? `🚨 STOP LOSS BREACHED — ${ticker} at $${currentPrice.toFixed(2)}, stop was $${stopAlert.target_price}. CLOSE POSITION.`
            : `⚠️ APPROACHING STOP — ${ticker} at $${currentPrice.toFixed(2)}, stop at $${stopAlert.target_price} (${(((currentPrice - stopAlert.target_price) / stopAlert.target_price) * 100).toFixed(1)}% away)`,
          severity: isBreach ? 'critical' : 'warning',
          current_price: currentPrice,
          trigger_price: stopAlert.target_price,
          position_pnl_pct: pnlPct,
        });
      }
    }

    if (pnlPct < -5 && (stopAlerts || []).length === 0) {
      alerts.push({
        ticker,
        alert_type: 'drawdown_warning',
        message: `⚠️ NO STOP SET — ${ticker} down ${Math.abs(pnlPct).toFixed(1)}% ($${Math.abs(pnlDollar).toFixed(0)}). Consider setting a stop loss.`,
        severity: 'warning',
        current_price: currentPrice,
        position_pnl_pct: pnlPct,
      });
    }

    if (pnlPct > 15) {
      alerts.push({
        ticker,
        alert_type: 'take_profit',
        message: `💰 STRONG GAIN — ${ticker} up ${pnlPct.toFixed(1)}% ($${pnlDollar.toFixed(0)}). Consider taking partial profits or raising stop loss.`,
        severity: 'info',
        current_price: currentPrice,
        position_pnl_pct: pnlPct,
      });
    }

    if (isOptions) {
      const expiryStr = ticker.slice(-15, -9);
      if (expiryStr.length === 6) {
        const year = '20' + expiryStr.slice(0, 2);
        const month = expiryStr.slice(2, 4);
        const day = expiryStr.slice(4, 6);
        const expiry = new Date(`${year}-${month}-${day}`);
        const dte = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        if (dte <= 7 && dte > 0) {
          alerts.push({
            ticker,
            alert_type: 'time_decay',
            message: `⏰ TIME DECAY WARNING — ${ticker} expires in ${dte} day${dte > 1 ? 's' : ''}. Theta is accelerating. Consider closing or rolling.`,
            severity: dte <= 3 ? 'critical' : 'warning',
            current_price: currentPrice,
            position_pnl_pct: pnlPct,
          });
        }
      }
    }
  }

  try {
    const exitSignals = await evaluateExitLogic();
    for (const signal of exitSignals) {
      alerts.push(exitSignalToAlert(signal));
    }
  } catch (e) {
    console.error('Exit logic evaluation error (non-fatal):', e);
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let alertsFired = 0;

  for (const alert of alerts) {
    const { data: existing } = await supabase
      .from('position_alerts')
      .select('id')
      .eq('ticker', alert.ticker)
      .eq('alert_type', alert.alert_type)
      .eq('status', 'active')
      .gte('fired_at', oneHourAgo)
      .maybeSingle();

    if (!existing) {
      await supabase.from('position_alerts').insert({
        ticker: alert.ticker,
        alert_type: alert.alert_type,
        message: alert.message,
        severity: alert.severity,
        current_price: alert.current_price,
        trigger_price: alert.trigger_price || null,
        position_pnl_pct: alert.position_pnl_pct,
        status: 'active',
        fired_at: new Date().toISOString(),
      });
      alertsFired++;
    }
  }

  return {
    alerts_fired: alertsFired,
    positions_checked: positions.length,
    alerts,
  };
}
