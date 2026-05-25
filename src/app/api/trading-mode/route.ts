import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  type TradingMode,
  DAY_TRADING_CONFIG,
  SWING_TRADING_CONFIG,
  getModeConfig,
  applyTradingMode,
} from '@/lib/services/trading-mode';

export type { TradingMode };

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'full_autonomy_enabled')
      .maybeSingle();

    const mode = (data?.value?.trading_mode as TradingMode) || 'swing_trading';
    const config = getModeConfig(mode);

    return NextResponse.json({
      current_mode: mode,
      config,
      day_trading_config: DAY_TRADING_CONFIG,
      swing_trading_config: SWING_TRADING_CONFIG,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const newMode: TradingMode = body.mode;

    if (!['day_trading', 'swing_trading'].includes(newMode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const config = await applyTradingMode(newMode);

    return NextResponse.json({
      success: true,
      mode: newMode,
      config,
      message: `Switched to ${newMode === 'day_trading' ? 'Day Trading' : 'Swing / Investing'} mode`,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
