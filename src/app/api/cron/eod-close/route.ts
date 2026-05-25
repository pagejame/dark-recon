import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const ALPACA_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const posRes = await fetch(`${ALPACA_BASE}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });

    if (!posRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }

    const positions = await posRes.json();
    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ success: true, closed: 0, message: 'No open positions at EOD' });
    }

    const closed: string[] = [];
    const failed: string[] = [];

    for (const position of positions) {
      const ticker = position.symbol;
      const isLong = parseFloat(position.qty) > 0;
      const currentPrice = parseFloat(position.current_price || '0');
      const entryPrice = parseFloat(position.avg_entry_price || '0');
      const pnlPct =
        entryPrice > 0
          ? ((currentPrice - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1)
          : 0;

      try {
        const closeRes = await fetch(`${ALPACA_BASE}/v2/positions/${ticker}`, {
          method: 'DELETE',
          headers: {
            'APCA-API-KEY-ID': ALPACA_KEY,
            'APCA-API-SECRET-KEY': ALPACA_SECRET,
          },
        });

        if (closeRes.ok) {
          closed.push(ticker);

          try {
            await supabase.from('audit_log').insert({
              event_type: 'position_closed',
              ticker,
              action_taken: `EOD FORCE CLOSE: ${ticker} ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% — all positions closed 3:50PM`,
              rationale: 'End of day force close — day trading rule: no overnight positions',
              price_at_action: currentPrice,
              pnl_pct: pnlPct,
              outcome: pnlPct >= 0 ? 'win' : 'loss',
              source: 'system',
              event_at: new Date().toISOString(),
            });
          } catch (e) {
            console.error('EOD audit log error:', e);
          }
        } else {
          failed.push(ticker);
        }
      } catch {
        failed.push(ticker);
      }
    }

    await fetch(`${ALPACA_BASE}/v2/orders`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    }).catch(console.error);

    try {
      await supabase.from('cron_runs').insert({
        job_name: 'eod-close',
        status: failed.length === 0 ? 'success' : 'partial',
        results: { closed, failed, total: positions.length },
        ran_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('EOD cron log error:', e);
    }

    return NextResponse.json({
      success: true,
      closed: closed.length,
      failed: failed.length,
      tickers_closed: closed,
    });
  } catch (error) {
    console.error('EOD close error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
