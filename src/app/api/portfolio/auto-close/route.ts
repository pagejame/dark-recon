import { NextRequest, NextResponse } from 'next/server';
import { runAutoClose } from '@/lib/services/auto-close';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data: settings } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'auto_close_enabled')
      .maybeSingle();

    // Default to ON for paper trading — user must explicitly disable in Settings
    const autoExecute = settings?.value?.enabled !== false;
    const results = await runAutoClose(autoExecute);

    return NextResponse.json({ results, auto_execute: autoExecute });
  } catch (error) {
    console.error('Auto-close API error:', error);
    return NextResponse.json({ results: [], error: 'Auto-close failed' });
  }
}
