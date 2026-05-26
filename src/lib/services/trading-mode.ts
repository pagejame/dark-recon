import { createAdminClient } from '@/lib/supabase/admin';

export type TradingMode = 'day_trading' | 'swing_trading';

export interface ModeConfig {
  trading_mode: TradingMode;
  daily_trade_limit: number;
  min_conviction: number;
  max_position_pct: number;
  profit_target_pct: number;
  profit_target_2_pct: number;
  profit_target_3_pct: number;
  stop_loss_pct: number;
  trailing_stop_pct: number;
  eod_force_close: boolean;
  short_selling_enabled: boolean;
  same_day_reentry: boolean;
  max_concurrent_positions: number;
  agent_cycle_seconds: number;
}

export const DAY_TRADING_CONFIG: ModeConfig = {
  trading_mode: 'day_trading',
  daily_trade_limit: 100,
  min_conviction: 7,
  max_position_pct: 3,
  profit_target_pct: 2,
  profit_target_2_pct: 5,
  profit_target_3_pct: 10,
  stop_loss_pct: 1.5,
  trailing_stop_pct: 1,
  eod_force_close: true,
  short_selling_enabled: true,
  same_day_reentry: true,
  max_concurrent_positions: 10,
  agent_cycle_seconds: 60,
};

export const SWING_TRADING_CONFIG: ModeConfig = {
  trading_mode: 'swing_trading',
  daily_trade_limit: 10,
  min_conviction: 8,
  max_position_pct: 8,
  profit_target_pct: 10,
  profit_target_2_pct: 20,
  profit_target_3_pct: 30,
  stop_loss_pct: 7,
  trailing_stop_pct: 3,
  eod_force_close: false,
  short_selling_enabled: false,
  same_day_reentry: false,
  max_concurrent_positions: 5,
  agent_cycle_seconds: 600,
};

export function getModeConfig(mode: TradingMode): ModeConfig {
  return mode === 'day_trading' ? DAY_TRADING_CONFIG : SWING_TRADING_CONFIG;
}

export async function applyTradingMode(newMode: TradingMode): Promise<ModeConfig> {
  const config = getModeConfig(newMode);
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'full_autonomy_enabled')
    .maybeSingle();

  const existingValue = (existing?.value as Record<string, unknown>) || {};

  await Promise.all([
    supabase.from('settings').upsert(
      {
        key: 'full_autonomy_enabled',
        value: {
          ...existingValue,
          enabled: existingValue.enabled !== false,
          trading_mode: config.trading_mode,
          profit_target_pct: config.profit_target_pct,
          profit_target_2_pct: config.profit_target_2_pct,
          profit_target_3_pct: config.profit_target_3_pct,
          stop_loss_pct: config.stop_loss_pct,
          trailing_stop_pct: config.trailing_stop_pct,
          short_selling_enabled: config.short_selling_enabled,
          same_day_reentry: config.same_day_reentry,
          max_concurrent_positions: config.max_concurrent_positions,
          eod_force_close: config.eod_force_close,
        },
        updated_at: now,
      },
      { onConflict: 'key' }
    ),

    supabase.from('settings').upsert(
      {
        key: 'autonomy_daily_trade_limit',
        value: { limit: config.daily_trade_limit },
        updated_at: now,
      },
      { onConflict: 'key' }
    ),

    supabase.from('settings').upsert(
      {
        key: 'autonomy_min_conviction',
        value: { score: config.min_conviction },
        updated_at: now,
      },
      { onConflict: 'key' }
    ),

    supabase.from('settings').upsert(
      {
        key: 'autonomy_max_position_pct',
        value: { pct: config.max_position_pct },
        updated_at: now,
      },
      { onConflict: 'key' }
    ),

    supabase.from('audit_log').insert({
      event_type: 'trading_mode_changed',
      ticker: 'SYSTEM',
      action_taken: `TRADING MODE SWITCHED TO: ${newMode.replace('_', ' ').toUpperCase()}`,
      rationale: `All parameters updated: ${config.daily_trade_limit} trades/day, ${config.max_position_pct}% max position, ${config.profit_target_pct}/${config.profit_target_2_pct}/${config.profit_target_3_pct}% targets, ${config.stop_loss_pct}% stop`,
      outcome: 'not_applicable',
      source: 'user',
      event_at: now,
    }),
  ]);

  return config;
}
