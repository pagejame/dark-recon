import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_SETTINGS = {
  watchlist: ['SPY', 'QQQ', 'NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL'],
  risk: { max_position_pct: 5, max_options_pct: 15, weekly_contribution: 500 },
  scanner: { auto_scan: true, scan_interval_minutes: 5, min_strength: 'low' },
  briefing: { enabled: true, include_levels: true, include_signals: true },
  notifications: { high_conviction: true, scan_complete: false, briefing_ready: true },
  email: { weekly_enabled: true, email_address: '' },
  auto_close_enabled: { enabled: false },
  watchlist_autopop_enabled: { enabled: true },
  autonomous_agent_enabled: { enabled: true },
};

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('settings').select('key, value');

    if (error) throw error;

    const settings = (data || []).reduce(
      (acc: Record<string, unknown>, row: { key: string; value: unknown }) => {
        acc[row.key] = row.value;
        return acc;
      },
      {}
    );

    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { key, value } = await request.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
