import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALPACA_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

export async function DELETE() {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/orders`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });

    const supabase = createAdminClient();
    try {
      await supabase.from('audit_log').insert({
        event_type: 'manual_override',
        ticker: 'ALL',
        action_taken: 'CANCELLED ALL OPEN ORDERS via API',
        rationale: 'Manual cancel-all triggered',
        outcome: 'not_applicable',
        source: 'user',
        event_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Cancel-all audit log error:', e);
    }

    return NextResponse.json({
      success: res.ok,
      status: res.status,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return DELETE();
}
