import { createAdminClient } from '@/lib/supabase/admin';

export interface StopLossConfig {
  ticker: string;
  position_type: 'stock' | 'call' | 'put';
  entry_price: number;
  stop_pct?: number;
}

export async function createStopLoss(config: StopLossConfig): Promise<{
  stop_price: number;
  alert_created: boolean;
  message: string;
}> {
  const stopPct = config.stop_pct || (config.position_type === 'stock' ? 0.07 : 0.5);
  const stopPrice =
    config.position_type === 'put'
      ? config.entry_price * (1 + stopPct)
      : config.entry_price * (1 - stopPct);

  const stopPriceRounded = Math.round(stopPrice * 100) / 100;

  try {
    const supabase = createAdminClient();

    const condition = config.position_type === 'put' ? 'above' : 'below';
    const { data: alert } = await supabase
      .from('price_alerts')
      .insert({
        ticker: config.ticker.toUpperCase(),
        condition,
        target_price: stopPriceRounded,
        note: `Auto stop-loss: ${config.position_type} entered at $${config.entry_price}. ${(stopPct * 100).toFixed(0)}% stop.`,
        status: 'active',
      })
      .select()
      .single();

    await supabase.from('stop_loss_presets').insert({
      ticker: config.ticker.toUpperCase(),
      position_type: config.position_type,
      entry_price: config.entry_price,
      stop_price: stopPriceRounded,
      stop_pct: stopPct,
      alert_id: alert?.id || null,
    });

    return {
      stop_price: stopPriceRounded,
      alert_created: true,
      message: `Stop loss set at $${stopPriceRounded} (${(stopPct * 100).toFixed(0)}% from entry). Alert active.`,
    };
  } catch (error) {
    console.error('Stop loss creation error:', error);
    return {
      stop_price: stopPriceRounded,
      alert_created: false,
      message: `Stop price calculated at $${stopPriceRounded} but alert creation failed.`,
    };
  }
}
