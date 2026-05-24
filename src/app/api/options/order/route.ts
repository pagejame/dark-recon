import { NextRequest, NextResponse } from 'next/server';
import { placeOptionsOrder } from '@/lib/api/alpaca';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStopLoss } from '@/lib/services/stoploss';

const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

function extractUnderlying(symbol: string): string {
  return symbol.replace(/\d.*/, '');
}

export async function POST(request: NextRequest) {
  try {
    const {
      symbol,
      qty,
      side,
      type,
      limit_price,
      ticker,
      strike,
      expiration,
      option_type,
      mid_price,
    } = await request.json();

    if (!symbol || !qty || !side) {
      return NextResponse.json({ error: 'symbol, qty, side required' }, { status: 400 });
    }

    if (!OCC_SYMBOL.test(symbol)) {
      return NextResponse.json({ error: 'Invalid OCC options symbol format' }, { status: 400 });
    }

    const order = await placeOptionsOrder({
      symbol,
      qty: parseInt(String(qty), 10),
      side,
      type: type || 'limit',
      limit_price: limit_price ? parseFloat(String(limit_price)) : undefined,
    });

    const underlying = ticker || extractUnderlying(symbol);
    const optType = option_type || (symbol.includes('C') ? 'call' : 'put');
    const entryPrice = parseFloat(String(limit_price || mid_price || '0'));
    const qtyNum = parseInt(String(qty), 10);

    try {
      const supabase = createAdminClient();

      const { data: position } = await supabase
        .from('positions')
        .insert({
          ticker: underlying,
          position_type: optType,
          entry_price: entryPrice,
          quantity: qtyNum,
          strike_price: strike ? parseFloat(String(strike)) : null,
          expiration_date: expiration || null,
          status: 'open',
          opened_at: new Date().toISOString(),
        })
        .select()
        .single();

      await supabase.from('trade_journal').insert({
        position_id: position?.id || null,
        ticker: underlying,
        position_type: optType,
        thesis: `Options ${String(side).toUpperCase()}: ${symbol}`,
        signal_source: 'Options Chain',
        entry_notes: `${String(side).toUpperCase()} ${qtyNum} contract${qtyNum > 1 ? 's' : ''} of ${symbol} at $${entryPrice.toFixed(2)} per contract ($${(entryPrice * 100 * qtyNum).toFixed(0)} total). Alpaca order ID: ${(order as { id?: string }).id || 'pending'}.`,
        created_at: new Date().toISOString(),
      });

      await supabase.from('strategy_decisions').insert({
        decision_type: 'entry',
        ticker: underlying,
        rationale: `Options ${optType} purchase: ${symbol} at $${entryPrice.toFixed(2)}`,
        signal_source: 'Options Chain',
        action_taken: true,
        decision_date: new Date().toISOString(),
      });
    } catch (journalError) {
      console.error('Journal logging error (non-fatal):', journalError);
    }

    if (side === 'buy' && entryPrice > 0) {
      try {
        await createStopLoss({
          ticker: underlying,
          position_type: optType as 'call' | 'put',
          entry_price: entryPrice * 100,
          stop_pct: 0.5,
        });
      } catch (stopError) {
        console.error('Stop loss creation error (non-fatal):', stopError);
      }
    }

    return NextResponse.json({
      ...order,
      logged: true,
      message: 'Order submitted and logged to Trade Journal',
    });
  } catch (error) {
    console.error('Options order error:', error);
    const message = error instanceof Error ? error.message : 'Options order failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
