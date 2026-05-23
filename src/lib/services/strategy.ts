import { createAdminClient } from '@/lib/supabase/admin';
import { getAccount, getPositions } from '@/lib/api/alpaca';

export interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  max_positions: number;
  max_position_pct: number;
  min_conviction_score: number;
  rebalance_frequency: string;
  benchmark_ticker: string;
  strategy_start_date: string;
  starting_capital: number;
  is_active: boolean;
}

export interface StrategySnapshot {
  snapshot_date: string;
  portfolio_value: number;
  total_return_pct: number | null;
  benchmark_return_pct: number | null;
  alpha: number | null;
}

export interface StrategyPerformance {
  current_value: number;
  starting_capital: number;
  total_pnl: number;
  total_return_pct: number;
  benchmark_return_pct: number;
  alpha: number;
  sharpe_ratio: number | null;
  max_drawdown: number;
  win_rate: number;
  positions_count: number;
  days_running: number;
  snapshots: StrategySnapshot[];
}

interface AlpacaAccount {
  equity?: string;
  cash?: string;
  last_equity?: string;
}

interface AlpacaPosition {
  symbol?: string;
}

function num(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
  return isNaN(n) ? fallback : n;
}

export async function getStrategyConfig(): Promise<StrategyConfig | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('strategy_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    return data as StrategyConfig | null;
  } catch {
    return null;
  }
}

export async function updateStrategyConfig(updates: Partial<StrategyConfig>): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('strategy_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('is_active', true);
}

export async function takeStrategySnapshot(): Promise<void> {
  try {
    const supabase = createAdminClient();
    const [account, positions, config] = await Promise.all([
      getAccount(),
      getPositions(),
      getStrategyConfig(),
    ]);

    if (!account || !config) return;

    const typedAccount = account as AlpacaAccount;
    const typedPositions = positions as AlpacaPosition[];

    const equity = parseFloat(typedAccount.equity || '0');
    const lastEquity = parseFloat(typedAccount.last_equity || equity.toString());
    const dayPnL = equity - lastEquity;
    const totalPnL = equity - num(config.starting_capital, 100000);
    const totalReturnPct = (totalPnL / num(config.starting_capital, 100000)) * 100;

    const today = new Date().toISOString().split('T')[0];

    await supabase.from('strategy_snapshots').upsert(
      {
        snapshot_date: today,
        portfolio_value: equity,
        cash: parseFloat(typedAccount.cash || '0'),
        invested: equity - parseFloat(typedAccount.cash || '0'),
        day_pnl: dayPnL,
        total_pnl: totalPnL,
        total_return_pct: totalReturnPct,
        benchmark_value: null,
        benchmark_return_pct: null,
        alpha: null,
        positions_count: typedPositions.length,
        snapshot_data: { positions, account },
      },
      { onConflict: 'snapshot_date' }
    );
  } catch (e) {
    console.error('Strategy snapshot error:', e);
  }
}

export async function logStrategyDecision(decision: {
  decision_type: 'entry' | 'exit' | 'rebalance' | 'pass' | 'hold';
  ticker?: string;
  rationale: string;
  conviction_score?: number;
  signal_source?: string;
  action_taken?: boolean;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('strategy_decisions').insert({
      ...decision,
      decision_date: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Strategy decision log error:', e);
  }
}

export async function getStrategyPerformance(): Promise<StrategyPerformance | null> {
  try {
    const supabase = createAdminClient();
    const [config, account, positions] = await Promise.all([
      getStrategyConfig(),
      getAccount(),
      getPositions(),
    ]);

    if (!config || !account) return null;

    const typedAccount = account as AlpacaAccount;
    const typedPositions = positions as AlpacaPosition[];

    const { data: snapshots } = await supabase
      .from('strategy_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true })
      .limit(90);

    const equity = parseFloat(typedAccount.equity || '0');
    const startingCapital = num(config.starting_capital, 100000);
    const totalPnL = equity - startingCapital;
    const totalReturnPct = (totalPnL / startingCapital) * 100;

    let maxDrawdown = 0;
    let peak = startingCapital;
    (snapshots || []).forEach((s) => {
      const val = num(s.portfolio_value);
      if (val > peak) peak = val;
      const drawdown = ((peak - val) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    const startDate = new Date(config.strategy_start_date);
    const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const benchmarkReturnPct =
      snapshots && snapshots.length > 0
        ? num(snapshots[snapshots.length - 1].benchmark_return_pct)
        : 0;

    return {
      current_value: equity,
      starting_capital: startingCapital,
      total_pnl: totalPnL,
      total_return_pct: totalReturnPct,
      benchmark_return_pct: benchmarkReturnPct,
      alpha: totalReturnPct - benchmarkReturnPct,
      sharpe_ratio: null,
      max_drawdown: maxDrawdown,
      win_rate: 0,
      positions_count: typedPositions.length,
      days_running: daysRunning,
      snapshots: (snapshots || []) as StrategySnapshot[],
    };
  } catch (e) {
    console.error('Strategy performance error:', e);
    return null;
  }
}
