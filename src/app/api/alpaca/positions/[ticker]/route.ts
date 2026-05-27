import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALPACA_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

async function closePosition(ticker: string) {
  const res = await fetch(`${ALPACA_BASE}/v2/positions/${ticker}`, {
    method: 'DELETE',
    headers: {
      'APCA-API-KEY-ID': ALPACA_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      ok: false as const,
      error: (err as { message?: string }).message || `Failed to close ${ticker}`,
    };
  }

  const order = await res.json();
  return { ok: true as const, order };
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker: rawTicker } = await params;
    const ticker = rawTicker.toUpperCase();

    const result = await closePosition(ticker);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    try {
      await supabase.from('audit_log').insert({
        event_type: 'position_closed',
        ticker,
        action_taken: `CLOSED: ${ticker} position via direct close`,
        rationale: 'Capacity management — over max concurrent positions',
        outcome: 'not_applicable',
        source: 'system',
        event_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Close position audit log error (non-fatal):', e);
    }

    try {
      await supabase
        .from('price_alerts')
        .update({ status: 'dismissed' })
        .eq('ticker', ticker)
        .eq('status', 'active');
    } catch (e) {
      console.error('Dismiss price alerts error (non-fatal):', e);
    }

    return NextResponse.json({
      success: true,
      ticker,
      order_id: result.order.id,
      message: `${ticker} position closed`,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  return DELETE(request, context);
}
