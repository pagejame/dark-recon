import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;

    const eventType = params.get('event_type');
    const ticker = params.get('ticker');
    const days = parseInt(params.get('days') || '30', 10);
    const limit = parseInt(params.get('limit') || '100', 10);

    let query = supabase
      .from('audit_log')
      .select('*')
      .order('event_at', { ascending: false })
      .limit(limit);

    if (eventType && eventType !== 'all') {
      query = query.eq('event_type', eventType);
    }

    if (ticker) {
      query = query.eq('ticker', ticker.toUpperCase());
    }

    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('event_at', since);
    }

    const { data, error } = await query;
    if (error) throw error;

    const events = data || [];
    const trades = events.filter((e) =>
      ['trade_executed', 'trade_approved'].includes(e.event_type)
    );
    const signals = events.filter((e) => e.event_type === 'signal_fired');
    const decisions = events.filter((e) =>
      ['trade_approved', 'trade_rejected'].includes(e.event_type)
    );

    return NextResponse.json({
      events,
      stats: {
        total: events.length,
        trades: trades.length,
        signals: signals.length,
        decisions: decisions.length,
      },
    });
  } catch {
    return NextResponse.json({
      events: [],
      stats: { total: 0, trades: 0, signals: 0, decisions: 0 },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('audit_log').insert(body).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Audit log failed' }, { status: 500 });
  }
}
