import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  submitMarketOrder,
  submitLimitOrder,
  placeOptionsOrder,
} from '@/lib/api/alpaca';
import { createStopLoss } from '@/lib/services/stoploss';
import { audit } from '@/lib/services/audit';

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
  status: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action, rejection_reason } = await request.json();
    const supabase = createAdminClient();

    const { data: trade, error } = await supabase
      .from('trade_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const row = trade as QueueTradeRow;

    if (row.status !== 'pending') {
      return NextResponse.json({ error: 'Trade already actioned' }, { status: 400 });
    }

    if (action === 'reject') {
      await supabase
        .from('trade_queue')
        .update({
          status: 'rejected',
          rejection_reason: rejection_reason || 'Rejected by user',
          actioned_at: new Date().toISOString(),
        })
        .eq('id', id);

      await supabase.from('strategy_decisions').insert({
        decision_type: 'pass',
        ticker: row.ticker,
        rationale: `Queue rejected: ${rejection_reason || 'User passed on trade'}`,
        conviction_score: row.conviction_score,
        signal_source: row.signal_sources?.join(', '),
        action_taken: false,
        decision_date: new Date().toISOString(),
      });

      await audit.tradeRejected({
        ticker: row.ticker,
        reason: rejection_reason || 'User passed on trade',
        convictionScore: row.conviction_score,
      });

      return NextResponse.json({ success: true, status: 'rejected' });
    }

    if (action === 'approve') {
      await supabase
        .from('trade_queue')
        .update({
          status: 'approved',
          actioned_at: new Date().toISOString(),
        })
        .eq('id', id);

      try {
        let order: { id?: string } | undefined;

        if (row.instrument_type === 'stock') {
          const qty = row.qty || 1;
          if (row.entry_type === 'limit' && row.limit_price) {
            order = await submitLimitOrder({
              symbol: row.ticker,
              qty,
              side: 'buy',
              limit_price: row.limit_price,
            });
          } else {
            order = await submitMarketOrder({
              symbol: row.ticker,
              qty,
              side: 'buy',
            });
          }
        } else if (row.options_symbol) {
          order = await placeOptionsOrder({
            symbol: row.options_symbol,
            qty: row.contracts || 1,
            side: 'buy',
            type: row.entry_type as 'market' | 'limit',
            limit_price: row.limit_price || undefined,
          });
        }

        await supabase
          .from('trade_queue')
          .update({
            status: 'executed',
            alpaca_order_id: order?.id || null,
            executed_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (row.stop_loss_pct) {
          const positionType =
            row.instrument_type === 'stock'
              ? 'stock'
              : (row.instrument_type as 'call' | 'put');
          const entryPrice = row.limit_price || row.strike_price || 0;
          await createStopLoss({
            ticker: row.ticker,
            position_type: positionType,
            entry_price: entryPrice,
            stop_pct: row.stop_loss_pct / 100,
          });
        }

        await supabase.from('trade_journal').insert({
          ticker: row.ticker,
          position_type: row.instrument_type,
          thesis: row.thesis_summary,
          signal_source: 'Autopilot Queue',
          entry_notes: `Auto-queued trade approved. Catalyst: ${row.key_catalyst}. Risk: ${row.risk_note}`,
          created_at: new Date().toISOString(),
        });

        await supabase.from('strategy_decisions').insert({
          decision_type: 'entry',
          ticker: row.ticker,
          rationale: row.thesis_summary,
          conviction_score: row.conviction_score,
          signal_source: 'Autopilot Queue',
          action_taken: true,
          decision_date: new Date().toISOString(),
        });

        const qty = row.qty || row.contracts || 1;
        const price = row.limit_price || row.strike_price || undefined;
        await audit.tradeApproved({
          ticker: row.ticker,
          instrument: row.instrument_type,
          price,
          quantity: qty,
          dollarAmount: price ? price * qty : undefined,
          convictionScore: row.conviction_score,
          thesis: row.thesis_summary,
          catalyst: row.key_catalyst || '',
          signalSources: row.signal_sources || undefined,
        });

        return NextResponse.json({
          success: true,
          status: 'executed',
          order_id: order?.id,
          message: `${row.qty || row.contracts} ${row.instrument_type === 'stock' ? 'shares' : 'contracts'} of ${row.ticker} order submitted`,
        });
      } catch (execError) {
        await supabase
          .from('trade_queue')
          .update({
            status: 'failed',
            rejection_reason:
              execError instanceof Error ? execError.message : 'Execution failed',
          })
          .eq('id', id);

        return NextResponse.json(
          {
            error: execError instanceof Error ? execError.message : 'Execution failed',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Queue action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
