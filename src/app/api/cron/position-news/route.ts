import { NextRequest, NextResponse } from 'next/server';
import { scanPositionNews } from '@/lib/services/position-news';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 55;

function isMarketHours(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const day = now.getUTCDay();
  if (day < 1 || day > 5) return false;
  const totalMinutes = hour * 60 + minute;
  // 9:30AM - 4:30PM ET = 13:30 - 20:30 UTC
  return totalMinutes >= 13 * 60 + 30 && totalMinutes < 20 * 60 + 30;
}

async function logCronRun(results: Record<string, unknown>) {
  try {
    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'position-news',
      status: 'success',
      results,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Position news cron log error:', e);
  }
}

export async function GET(request: NextRequest) {
  if (!isMarketHours()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Outside market hours',
    });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const posRes = await fetch('https://paper-api.alpaca.markets/v2/positions', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
      },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!posRes?.ok) {
      await logCronRun({ skipped: true, reason: 'No positions to scan' });
      return NextResponse.json({ success: true, message: 'No positions to scan' });
    }

    let positions: unknown;
    try {
      positions = await posRes.json();
    } catch {
      await logCronRun({ skipped: true, reason: 'Invalid positions response' });
      return NextResponse.json({ success: true, message: 'No positions to scan' });
    }

    if (!Array.isArray(positions) || positions.length === 0) {
      await logCronRun({ skipped: true, reason: 'No open positions' });
      return NextResponse.json({ success: true, message: 'No open positions' });
    }

    const alerts = await scanPositionNews();
    const results = {
      alerts_found: alerts.length,
      high_urgency: alerts.filter((a) => a.urgency === 'high').length,
      positions_scanned: positions.length,
    };
    await logCronRun(results);
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('Position news cron error:', error);
    return NextResponse.json({ error: 'Position news scan failed' }, { status: 500 });
  }
}
