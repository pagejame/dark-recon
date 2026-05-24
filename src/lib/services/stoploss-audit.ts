import { createAdminClient } from '@/lib/supabase/admin';
import { getPositions } from '@/lib/api/alpaca';
import { createStopLoss } from '@/lib/services/stoploss';

export interface StopLossAuditResult {
  ticker: string;
  has_stop: boolean;
  stop_price?: number;
  stop_pct?: number;
  current_price: number;
  entry_price: number;
  pnl_pct: number;
  auto_created: boolean;
  message: string;
}

const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

interface AlpacaPositionRow {
  symbol: string;
  current_price?: string;
  avg_entry_price?: string;
  unrealized_plpc?: string;
}

interface StopAlertRow {
  target_price: number;
}

export async function runStopLossAudit(): Promise<StopLossAuditResult[]> {
  const supabase = createAdminClient();
  const positions = (await getPositions()) as AlpacaPositionRow[];

  if (!positions || positions.length === 0) return [];

  const results: StopLossAuditResult[] = [];

  for (const position of positions) {
    const ticker = position.symbol;
    const currentPrice = parseFloat(position.current_price || '0');
    const entryPrice = parseFloat(position.avg_entry_price || '0');
    const pnlPct = parseFloat(position.unrealized_plpc || '0') * 100;
    const isOptions = OCC_SYMBOL.test(ticker);
    const underlyingTicker = isOptions ? ticker.replace(/\d.*/, '') : ticker;

    const { data: stopAlerts } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('ticker', underlyingTicker)
      .eq('status', 'active')
      .eq('condition', 'below');

    if (stopAlerts && stopAlerts.length > 0) {
      const stop = stopAlerts[0] as StopAlertRow;
      const stopPct = entryPrice > 0 ? ((entryPrice - stop.target_price) / entryPrice) * 100 : 0;

      results.push({
        ticker,
        has_stop: true,
        stop_price: stop.target_price,
        stop_pct: stopPct,
        current_price: currentPrice,
        entry_price: entryPrice,
        pnl_pct: pnlPct,
        auto_created: false,
        message: `✓ Stop set at $${stop.target_price} (${stopPct.toFixed(1)}% from entry)`,
      });
    } else {
      try {
        const stopResult = await createStopLoss({
          ticker: underlyingTicker,
          position_type: isOptions ? 'call' : 'stock',
          entry_price: entryPrice,
          stop_pct: isOptions ? 0.5 : 0.07,
        });

        results.push({
          ticker,
          has_stop: stopResult.alert_created,
          stop_price: stopResult.stop_price,
          stop_pct: isOptions ? 50 : 7,
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          auto_created: stopResult.alert_created,
          message: stopResult.alert_created
            ? `⚡ Auto-created: ${stopResult.message}`
            : `✗ No stop set — ${stopResult.message}`,
        });
      } catch {
        results.push({
          ticker,
          has_stop: false,
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          auto_created: false,
          message: '✗ No stop set — manual setup required',
        });
      }
    }
  }

  return results;
}
