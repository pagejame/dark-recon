import { getPositions, submitMarketOrder } from '@/lib/api/alpaca';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ExitSignal {
  ticker: string;
  exit_type:
    | 'trailing_stop'
    | 'momentum_loss'
    | 'time_stop'
    | 'thesis_break'
    | 'intraday_reversal';
  current_price: number;
  entry_price: number;
  pnl_pct: number;
  peak_pnl_pct: number;
  reason: string;
  urgency: 'immediate' | 'monitor';
  action: 'close_full' | 'close_half' | 'raise_stop';
}

interface AlpacaPositionRow {
  symbol: string;
  current_price?: string;
  avg_entry_price?: string;
  qty?: string;
  market_value?: string;
  unrealized_intraday_plpc?: string;
  change_today?: string;
}

interface PeakPnlRawData {
  peak_pnl_pct?: number;
}

async function closePosition(
  ticker: string,
  qty: number,
  side: 'sell' | 'buy'
): Promise<boolean> {
  try {
    await submitMarketOrder({
      symbol: ticker,
      qty: Math.abs(qty),
      side,
      type: 'market',
      time_in_force: 'day',
    });
    return true;
  } catch {
    return false;
  }
}

function getTodayChangePct(position: AlpacaPositionRow): number {
  const intradayPct = parseFloat(position.unrealized_intraday_plpc || '0');
  if (intradayPct !== 0) return intradayPct * 100;

  const marketValue = parseFloat(position.market_value || '0');
  const changeToday = parseFloat(position.change_today || '0');
  if (marketValue > 0 && changeToday !== 0) {
    return (changeToday / marketValue) * 100;
  }
  return 0;
}

export async function evaluateExitLogic(): Promise<ExitSignal[]> {
  const supabase = createAdminClient();
  const positions = (await getPositions()) as AlpacaPositionRow[];
  const exitSignals: ExitSignal[] = [];

  if (!Array.isArray(positions) || positions.length === 0) return [];

  const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00Z`;

  for (const position of positions) {
    const ticker = position.symbol;
    const currentPrice = parseFloat(position.current_price || '0');
    const entryPrice = parseFloat(position.avg_entry_price || '0');
    const qty = parseFloat(position.qty || '0');
    const isLong = qty > 0;

    if (entryPrice === 0 || currentPrice === 0) continue;

    const pnlPct = isLong
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    const todayChangePct = getTodayChangePct(position);

    const { data: peakData } = await supabase
      .from('audit_log')
      .select('raw_data')
      .eq('ticker', ticker)
      .eq('event_type', 'position_peak_pnl')
      .gte('event_at', todayStart)
      .order('event_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const storedPeak = (peakData?.raw_data as PeakPnlRawData | null)?.peak_pnl_pct || 0;
    const peakPnlPct = Math.max(pnlPct, storedPeak);

    if (pnlPct > storedPeak) {
      try {
        await supabase.from('audit_log').insert({
          event_type: 'position_peak_pnl',
          ticker,
          action_taken: `Peak P&L updated: ${pnlPct.toFixed(2)}%`,
          rationale: `New peak for ${ticker}`,
          price_at_action: currentPrice,
          pnl_pct: pnlPct,
          raw_data: { peak_pnl_pct: pnlPct, price: currentPrice },
          outcome: 'not_applicable',
          source: 'system',
          event_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Peak P&L audit log error (non-fatal):', e);
      }
    }

    // RULE 1: TRAILING PROFIT LOCK
    if (pnlPct > 0 && peakPnlPct > 1) {
      const drawdownFromPeak = peakPnlPct - pnlPct;

      if (peakPnlPct >= 1 && peakPnlPct < 3 && drawdownFromPeak > peakPnlPct * 0.8) {
        exitSignals.push({
          ticker,
          exit_type: 'trailing_stop',
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          peak_pnl_pct: peakPnlPct,
          reason: `Was up ${peakPnlPct.toFixed(2)}% — gave back ${drawdownFromPeak.toFixed(2)}% of gains. Protecting remaining profit.`,
          urgency: 'immediate',
          action: 'close_full',
        });
      }

      if (peakPnlPct >= 3 && peakPnlPct < 7 && drawdownFromPeak > peakPnlPct * 0.6) {
        exitSignals.push({
          ticker,
          exit_type: 'trailing_stop',
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          peak_pnl_pct: peakPnlPct,
          reason: `Was up ${peakPnlPct.toFixed(2)}% — gave back ${drawdownFromPeak.toFixed(2)}%. Closing to protect gains.`,
          urgency: 'immediate',
          action: 'close_half',
        });
      }

      if (peakPnlPct >= 7 && drawdownFromPeak > peakPnlPct * 0.4) {
        exitSignals.push({
          ticker,
          exit_type: 'trailing_stop',
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          peak_pnl_pct: peakPnlPct,
          reason: `Runner ${ticker} was up ${peakPnlPct.toFixed(2)}% — gave back ${drawdownFromPeak.toFixed(2)}%. Protecting runner gains.`,
          urgency: 'immediate',
          action: 'close_half',
        });
      }
    }

    // RULE 2: INTRADAY MOMENTUM LOSS — was profitable, now reversing
    if (peakPnlPct > 1.5 && pnlPct < 0.5 && todayChangePct < -1.5) {
      exitSignals.push({
        ticker,
        exit_type: 'momentum_loss',
        current_price: currentPrice,
        entry_price: entryPrice,
        pnl_pct: pnlPct,
        peak_pnl_pct: peakPnlPct,
        reason: `${ticker} was up ${peakPnlPct.toFixed(2)}% today, now ${pnlPct.toFixed(2)}% (${todayChangePct.toFixed(2)}% intraday). Momentum lost — exit.`,
        urgency: 'immediate',
        action: 'close_full',
      });
    }

    // RULE 3: INTRADAY REVERSAL — down today AND overall losing
    if (todayChangePct < -2 && pnlPct < 0) {
      exitSignals.push({
        ticker,
        exit_type: 'intraday_reversal',
        current_price: currentPrice,
        entry_price: entryPrice,
        pnl_pct: pnlPct,
        peak_pnl_pct: peakPnlPct,
        reason: `${ticker} down ${Math.abs(todayChangePct).toFixed(2)}% today with negative overall P&L (${pnlPct.toFixed(2)}%). Momentum broken — no reason to hold.`,
        urgency: 'immediate',
        action: 'close_full',
      });
    }

    // RULE 4: DEAD MONEY TIME STOP
    const { data: entryLog } = await supabase
      .from('audit_log')
      .select('event_at')
      .eq('ticker', ticker)
      .in('event_type', ['trade_executed', 'position_opened'])
      .order('event_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entryLog?.event_at) {
      const daysHeld =
        (Date.now() - new Date(entryLog.event_at).getTime()) / (1000 * 60 * 60 * 24);

      if (daysHeld >= 3 && Math.abs(pnlPct) < 1) {
        exitSignals.push({
          ticker,
          exit_type: 'time_stop',
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          peak_pnl_pct: peakPnlPct,
          reason: `${ticker} held ${daysHeld.toFixed(0)} days with only ${pnlPct.toFixed(2)}% gain. Dead money — capital better deployed elsewhere.`,
          urgency: 'monitor',
          action: 'close_full',
        });
      }
    }

    // RULE 5: THESIS INVALIDATION
    const { data: currentThesis } = await supabase
      .from('theses')
      .select('overall_direction, conviction_score, generated_at')
      .eq('ticker', ticker)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentThesis?.generated_at && entryLog?.event_at) {
      const thesisAfterEntry =
        new Date(currentThesis.generated_at).getTime() >
        new Date(entryLog.event_at).getTime();

      const thesisBreaksLong =
        isLong &&
        thesisAfterEntry &&
        currentThesis.overall_direction === 'bearish' &&
        (currentThesis.conviction_score ?? 0) >= 6;

      const thesisBreaksShort =
        !isLong &&
        thesisAfterEntry &&
        currentThesis.overall_direction === 'bullish' &&
        (currentThesis.conviction_score ?? 0) >= 6;

      if (thesisBreaksLong || thesisBreaksShort) {
        exitSignals.push({
          ticker,
          exit_type: 'thesis_break',
          current_price: currentPrice,
          entry_price: entryPrice,
          pnl_pct: pnlPct,
          peak_pnl_pct: peakPnlPct,
          reason: `${ticker} thesis flipped to ${currentThesis.overall_direction} (conviction ${currentThesis.conviction_score}/10). Original buy thesis no longer valid.`,
          urgency: 'monitor',
          action: 'close_full',
        });
      }
    }
  }

  return exitSignals;
}

async function executeImmediateExits(
  exitSignals: ExitSignal[],
  positions: AlpacaPositionRow[]
): Promise<void> {
  const supabase = createAdminClient();

  for (const signal of exitSignals.filter((s) => s.urgency === 'immediate')) {
    const position = positions.find((p) => p.symbol === signal.ticker);
    if (!position) continue;

    const qty = Math.abs(parseFloat(position.qty || '0'));
    const isLong = parseFloat(position.qty || '0') > 0;
    const closeQty = signal.action === 'close_half' ? Math.floor(qty / 2) : qty;

    if (closeQty < 1) continue;

    const success = await closePosition(signal.ticker, closeQty, isLong ? 'sell' : 'buy');

    if (success) {
      try {
        await supabase.from('audit_log').insert({
          event_type: 'position_closed',
          ticker: signal.ticker,
          action_taken: `EXIT [${signal.exit_type.toUpperCase()}]: ${signal.action === 'close_half' ? 'Closed 50%' : 'Closed full position'} @ $${signal.current_price.toFixed(2)} (${signal.pnl_pct >= 0 ? '+' : ''}${signal.pnl_pct.toFixed(2)}%)`,
          rationale: signal.reason,
          price_at_action: signal.current_price,
          pnl_pct: signal.pnl_pct,
          outcome: signal.pnl_pct >= 0 ? 'win' : 'loss',
          source: 'system',
          event_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Exit audit log error (non-fatal):', e);
      }

      if (signal.action === 'close_full') {
        try {
          await supabase
            .from('price_alerts')
            .update({ status: 'dismissed' })
            .eq('ticker', signal.ticker)
            .eq('status', 'active');
        } catch (e) {
          console.error('Dismiss price alerts error (non-fatal):', e);
        }
      }

      console.log(
        `[EXIT] ${signal.exit_type}: Closed ${signal.action === 'close_half' ? '50% of ' : ''}${signal.ticker} @ $${signal.current_price} (${signal.pnl_pct.toFixed(2)}%) — ${signal.reason}`
      );
    }
  }
}

export async function runExitLogic(): Promise<ExitSignal[]> {
  const positions = (await getPositions()) as AlpacaPositionRow[];
  const exitSignals = await evaluateExitLogic();

  if (exitSignals.length > 0 && positions.length > 0) {
    await executeImmediateExits(exitSignals, positions);
  }

  return exitSignals;
}
