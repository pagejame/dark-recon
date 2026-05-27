'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

interface StrategyConfig {
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

interface StrategySnapshot {
  snapshot_date: string;
  portfolio_value: number;
}

interface StrategyPerformance {
  current_value: number;
  starting_capital: number;
  total_pnl: number;
  total_return_pct: number;
  benchmark_return_pct: number;
  alpha: number;
  max_drawdown: number;
  positions_count: number;
  days_running: number;
  snapshots: StrategySnapshot[];
}

interface StrategyDecision {
  id: string;
  decision_date: string;
  decision_type: string;
  ticker: string | null;
  rationale: string;
  conviction_score: number | null;
  action_taken: boolean;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  market_value: string;
  unrealized_plpc: string;
}

interface AlpacaAccount {
  equity: string;
  cash: string;
}

type ChartPeriod = '1W' | '1M' | 'ALL';

const DECISION_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  entry: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
  exit: { color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' },
  pass: { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' },
  hold: { color: '#3d9aff', bg: '#3d9aff15', border: '#3d9aff40' },
  rebalance: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
};

function Skeleton({ height = 20 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        background: 'linear-gradient(90deg, #1e2a3a 25%, #2a3a4a 50%, #1e2a3a 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: 6,
      }}
    />
  );
}

function SectionCard({
  label,
  borderColor,
  children,
  className,
}: {
  label: string;
  borderColor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 3,
          color: borderColor,
          marginBottom: 16,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function formatMoney(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function StrategyChart({
  snapshots,
  period,
  onPeriodChange,
  daysRunning,
}: {
  snapshots: StrategySnapshot[];
  period: ChartPeriod;
  onPeriodChange: (p: ChartPeriod) => void;
  daysRunning: number;
}) {
  const filtered = useMemo(() => {
    if (period === 'ALL') return snapshots;
    const days = period === '1W' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return snapshots.filter((s) => new Date(s.snapshot_date) >= cutoff);
  }, [snapshots, period]);

  const renderChart = () => {
    if (filtered.length < 7) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
            gap: 8,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 1,
            textAlign: 'center',
          }}
        >
          <div>Building track record…</div>
          <div style={{ fontSize: 10, color: '#3d5068' }}>
            {filtered.length} / 7 daily snapshots · {daysRunning} days running
          </div>
        </div>
      );
    }

    if (filtered.length < 2) {
      return (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8', fontFamily: 'monospace', fontSize: 11 }}>
          NOT ENOUGH DATA YET
        </div>
      );
    }

    const values = filtered.map((s) => Number(s.portfolio_value));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const endVal = values[values.length - 1];
    const startVal = values[0];
    const isPositive = endVal >= startVal;
    const lineColor = isPositive ? '#00ff88' : '#ff3d5a';

    const width = 800;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = values.map((eq, i) => {
      const x = padding.left + (i / (values.length - 1)) * chartWidth;
      const y = padding.top + ((maxVal - eq) / range) * chartHeight;
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const firstX = padding.left;
    const lastX = padding.left + chartWidth;
    const baseY = padding.top + chartHeight;
    const fillD = `M ${firstX},${baseY} L ${points.join(' L ')} L ${lastX},${baseY} Z`;

    return (
      <div style={{ overflowX: 'auto' }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
          <path d={fillD} fill={lineColor} opacity="0.08" />
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
          {points.length > 0 && (
            <circle
              cx={parseFloat(points[points.length - 1].split(',')[0])}
              cy={parseFloat(points[points.length - 1].split(',')[1])}
              r="4"
              fill={lineColor}
            />
          )}
        </svg>
      </div>
    );
  };

  return (
    <SectionCard label="STRATEGY PERFORMANCE" borderColor="#00ff88" className="mb-6">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 16 }}>
        {(['1W', '1M', 'ALL'] as ChartPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${period === p ? '#00ff88' : '#1e2a3a'}`,
              background: period === p ? '#00ff8815' : 'transparent',
              color: period === p ? '#00ff88' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}
      </div>
      {renderChart()}
    </SectionCard>
  );
}

export default function StrategyPage() {
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [performance, setPerformance] = useState<StrategyPerformance | null>(null);
  const [decisions, setDecisions] = useState<StrategyDecision[]>([]);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('ALL');

  const [rulesForm, setRulesForm] = useState({
    name: 'Dark Recon Alpha',
    max_positions: 10,
    max_position_pct: 10,
    min_conviction_score: 6,
    rebalance_frequency: 'weekly',
  });

  const [decisionFormOpen, setDecisionFormOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState({
    decision_type: 'entry' as StrategyDecision['decision_type'],
    ticker: '',
    rationale: '',
    conviction_score: 6,
    action_taken: false,
  });
  const [savingDecision, setSavingDecision] = useState(false);
  const [autonomyConfig, setAutonomyConfig] = useState<{
    enabled: boolean;
    started_at: string | null;
    ends_at: string | null;
    days_remaining: number | null;
    daily_trade_limit: number;
    min_conviction: number;
  } | null>(null);
  const [tradingMode, setTradingMode] = useState<'day_trading' | 'swing_trading'>('swing_trading');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [strategyRes, decisionsRes, positionsRes, accountRes] = await Promise.all([
        fetch('/api/strategy'),
        fetch('/api/strategy?type=decisions'),
        fetch('/api/trading/positions'),
        fetch('/api/trading/account'),
      ]);

      const strategyData = await strategyRes.json();
      const decisionsData = await decisionsRes.json();
      const positionsData = await positionsRes.json();
      const accountData = await accountRes.json();

      if (strategyData.config) {
        setConfig(strategyData.config);
        setRulesForm({
          name: strategyData.config.name,
          max_positions: strategyData.config.max_positions,
          max_position_pct: Number(strategyData.config.max_position_pct),
          min_conviction_score: strategyData.config.min_conviction_score,
          rebalance_frequency: strategyData.config.rebalance_frequency,
        });
      }
      setPerformance(strategyData.performance);
      setDecisions(decisionsData.decisions || []);
      setPositions(positionsData.positions || []);
      setAccount(accountRes.ok ? accountData : null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    void fetch('/api/autonomy')
      .then((r) => r.json())
      .then((data) => setAutonomyConfig(data))
      .catch(() => setAutonomyConfig(null));
    void fetch('/api/trading-mode')
      .then((r) => r.json())
      .then((data) => {
        if (data.current_mode) setTradingMode(data.current_mode);
      })
      .catch(() => {});
  }, [fetchData]);

  const saveRules = async () => {
    setSavingRules(true);
    setRulesSaved(false);
    try {
      const res = await fetch('/api/strategy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulesForm),
      });
      if (!res.ok) throw new Error('Save failed');
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2000);
      void fetchData();
    } catch {
      // silent
    } finally {
      setSavingRules(false);
    }
  };

  const saveDecision = async () => {
    if (!decisionForm.rationale.trim()) return;
    setSavingDecision(true);
    try {
      const res = await fetch('/api/strategy/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...decisionForm,
          ticker: decisionForm.ticker.toUpperCase() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setDecisionFormOpen(false);
      setDecisionForm({
        decision_type: 'entry',
        ticker: '',
        rationale: '',
        conviction_score: 6,
        action_taken: false,
      });
      const decisionsRes = await fetch('/api/strategy?type=decisions');
      const data = await decisionsRes.json();
      setDecisions(data.decisions || []);
    } catch {
      // silent
    } finally {
      setSavingDecision(false);
    }
  };

  const equity = performance?.current_value || parseFloat(account?.equity || '0');
  const cash = parseFloat(account?.cash || '0');
  const totalReturn = performance?.total_return_pct ?? 0;
  const hasBenchmark = performance && performance.snapshots.some((s) => s.portfolio_value > 0) && performance.benchmark_return_pct !== 0;

  const allocationRows = useMemo(() => {
    const rows = positions.map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      value: parseFloat(p.market_value || '0'),
      pnlPct: parseFloat(p.unrealized_plpc || '0') * 100,
    }));
    const invested = rows.reduce((sum, r) => sum + r.value, 0);
    const total = equity || invested + cash;
    return {
      rows: rows.map((r) => ({ ...r, pct: total > 0 ? (r.value / total) * 100 : 0 })),
      cash,
      cashPct: total > 0 ? (cash / total) * 100 : 0,
      total,
    };
  }, [positions, equity, cash]);

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    background: '#0d1117',
    border: '1px solid #1e2a3a',
    borderRadius: 6,
    color: '#e8edf5',
    fontFamily: 'monospace',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div className="dr-page">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: '#00ff88', marginBottom: 6 }}>
          ◆ DARK RECON
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, color: '#e8edf5', margin: 0 }}>
            Strategy Manager
          </h1>
          {config && (
            <>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 1,
                  color: config.is_active ? '#00ff88' : '#ffd700',
                  background: config.is_active ? '#00ff8815' : '#ffd70015',
                  border: `1px solid ${config.is_active ? '#00ff8840' : '#ffd70040'}`,
                  padding: '4px 12px',
                  borderRadius: 20,
                }}
              >
                {config.is_active ? 'ACTIVE' : 'PAUSED'}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068' }}>
                {performance?.days_running ?? 0} days running
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          {config?.name || 'Dark Recon Alpha'}
          {config?.description && ` — ${config.description.slice(0, 80)}…`}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            padding: '6px 14px',
            borderRadius: 20,
            background: tradingMode === 'day_trading' ? '#ffd70015' : '#00ff8815',
            border: `1px solid ${tradingMode === 'day_trading' ? '#ffd70040' : '#00ff8840'}`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: tradingMode === 'day_trading' ? '#ffd700' : '#00ff88',
            }}
          />
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: 700,
              color: tradingMode === 'day_trading' ? '#ffd700' : '#00ff88',
              letterSpacing: 1,
            }}
          >
            {tradingMode === 'day_trading' ? 'DAY TRADING MODE' : 'SWING / INVESTING MODE'}
          </span>
        </div>
      </div>

      {/* Performance Hero */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: 'PORTFOLIO VALUE',
            value: loading ? '—' : formatMoney(equity),
            color: '#e8edf5',
          },
          {
            label: 'TOTAL RETURN',
            value: loading ? '—' : `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`,
            sub: config ? `vs ${formatMoney(Number(config.starting_capital))}` : '',
            color: totalReturn >= 0 ? '#00ff88' : '#ff3d5a',
          },
          {
            label: 'ALPHA',
            value: loading
              ? '—'
              : hasBenchmark
                ? `${(performance?.alpha ?? 0) >= 0 ? '+' : ''}${(performance?.alpha ?? 0).toFixed(2)}%`
                : 'Calculating…',
            color: '#3d9aff',
          },
          {
            label: 'MAX DRAWDOWN',
            value: loading ? '—' : `-${(performance?.max_drawdown ?? 0).toFixed(2)}%`,
            color: '#ff3d5a',
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderTop: `2px solid ${card.color}`,
              borderRadius: 10,
              padding: '16px 18px',
            }}
          >
            <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: '#7a8fa8', marginBottom: 8 }}>
              {card.label}
            </div>
            {loading ? (
              <Skeleton height={32} />
            ) : (
              <>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: card.color }}>
                  {card.value}
                </div>
                {'sub' in card && card.sub && (
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', marginTop: 4 }}>
                    {card.sub}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {autonomyConfig?.enabled && (
        <div
          style={{
            background: '#00ff8808',
            border: '1px solid #00ff8840',
            borderLeft: '3px solid #00ff88',
            borderRadius: 10,
            padding: '18px 22px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: '#00ff88',
                  marginBottom: 8,
                }}
              >
                30-DAY AUTONOMY TRIAL
              </div>
              <div style={{ fontSize: 14, color: '#e8edf5', marginBottom: 6 }}>
                Paper trading with full automation — no approval gates
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>
                Conviction ≥ {autonomyConfig.min_conviction} · Max{' '}
                {autonomyConfig.daily_trade_limit} trades/day · All actions audited
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {autonomyConfig.days_remaining != null && (
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 32,
                      fontWeight: 700,
                      color: '#00ff88',
                    }}
                  >
                    {autonomyConfig.days_remaining}
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 2,
                      color: '#7a8fa8',
                    }}
                  >
                    DAYS LEFT
                  </div>
                </div>
              )}
              {autonomyConfig.started_at && autonomyConfig.ends_at && (
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', lineHeight: 1.8 }}>
                  <div>
                    Started {new Date(autonomyConfig.started_at).toLocaleDateString()}
                  </div>
                  <div>Ends {new Date(autonomyConfig.ends_at).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {performance && (
        <StrategyChart
          snapshots={performance.snapshots}
          period={chartPeriod}
          onPeriodChange={setChartPeriod}
          daysRunning={performance.days_running}
        />
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Strategy Rules */}
        <SectionCard label="STRATEGY RULES" borderColor="#3d9aff">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                STRATEGY NAME
              </label>
              <input
                value={rulesForm.name}
                onChange={(e) => setRulesForm({ ...rulesForm, name: e.target.value })}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                  MAX POSITIONS
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rulesForm.max_positions}
                  onChange={(e) =>
                    setRulesForm({ ...rulesForm, max_positions: parseInt(e.target.value, 10) || 10 })
                  }
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                  MAX POSITION SIZE (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={rulesForm.max_position_pct}
                  onChange={(e) =>
                    setRulesForm({ ...rulesForm, max_position_pct: parseFloat(e.target.value) || 10 })
                  }
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                MIN CONVICTION SCORE (1-10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={rulesForm.min_conviction_score}
                onChange={(e) =>
                  setRulesForm({
                    ...rulesForm,
                    min_conviction_score: parseInt(e.target.value, 10) || 6,
                  })
                }
                style={{ ...inputStyle, marginTop: 4, maxWidth: 80 }}
              />
            </div>
            <div>
              <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                REBALANCE FREQUENCY
              </label>
              <select
                value={rulesForm.rebalance_frequency}
                onChange={(e) => setRulesForm({ ...rulesForm, rebalance_frequency: e.target.value })}
                style={{ ...inputStyle, marginTop: 4, maxWidth: 160, cursor: 'pointer' }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                  STARTING CAPITAL
                </label>
                <input
                  value={formatMoney(Number(config?.starting_capital || 100000))}
                  disabled
                  style={{ ...inputStyle, marginTop: 4, opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8', letterSpacing: 1 }}>
                  BENCHMARK
                </label>
                <input
                  value={config?.benchmark_ticker || 'SPY'}
                  disabled
                  style={{ ...inputStyle, marginTop: 4, opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveRules()}
              disabled={savingRules}
              style={{
                marginTop: 8,
                padding: '10px 20px',
                background: savingRules ? '#1e2a3a' : '#3d9aff',
                color: savingRules ? '#7a8fa8' : '#080a0f',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: savingRules ? 'wait' : 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              {savingRules ? 'SAVING…' : 'SAVE RULES'}
            </button>
            {rulesSaved && (
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#00ff88' }}>Saved</span>
            )}
          </div>
        </SectionCard>

        {/* Current Allocation */}
        <SectionCard label="CURRENT ALLOCATION" borderColor="#00ff88">
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allocationRows.rows.length === 0 ? (
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068' }}>No open positions</div>
              ) : (
                allocationRows.rows.map((row) => (
                  <div key={row.symbol}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: '#ffd700', fontWeight: 700 }}>{row.symbol}</span>
                      <span style={{ color: '#7a8fa8' }}>
                        {row.qty} sh · {row.pct.toFixed(1)}% ·{' '}
                        <span style={{ color: row.pnlPct >= 0 ? '#00ff88' : '#ff3d5a' }}>
                          {row.pnlPct >= 0 ? '+' : ''}
                          {row.pnlPct.toFixed(2)}%
                        </span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#1e2a3a', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${row.pct}%`, height: '100%', background: '#00ff88', minWidth: row.pct > 0 ? 4 : 0 }} />
                    </div>
                  </div>
                ))
              )}
              <div style={{ borderTop: '1px solid #1e2a3a', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: '#7a8fa8' }}>CASH</span>
                  <span style={{ color: '#7a8fa8' }}>{allocationRows.cashPct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 6, background: '#1e2a3a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${allocationRows.cashPct}%`, height: '100%', background: '#3d5068' }} />
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Decision Log */}
      <SectionCard label="DECISION LOG" borderColor="#ffd700">
        <div style={{ marginBottom: 16 }}>
          {!decisionFormOpen ? (
            <button
              type="button"
              onClick={() => setDecisionFormOpen(true)}
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                color: '#ffd700',
                background: '#ffd70015',
                border: '1px solid #ffd70040',
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              LOG DECISION
            </button>
          ) : (
            <div style={{ background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={decisionForm.decision_type}
                  onChange={(e) =>
                    setDecisionForm({ ...decisionForm, decision_type: e.target.value as StrategyDecision['decision_type'] })
                  }
                  style={inputStyle}
                >
                  <option value="entry">Entry</option>
                  <option value="exit">Exit</option>
                  <option value="rebalance">Rebalance</option>
                  <option value="pass">Pass</option>
                  <option value="hold">Hold</option>
                </select>
                <input
                  placeholder="Ticker"
                  value={decisionForm.ticker}
                  onChange={(e) => setDecisionForm({ ...decisionForm, ticker: e.target.value.toUpperCase() })}
                  style={inputStyle}
                />
              </div>
              <textarea
                placeholder="Rationale"
                value={decisionForm.rationale}
                onChange={(e) => setDecisionForm({ ...decisionForm, rationale: e.target.value })}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: 8, color: '#7a8fa8' }}>CONVICTION</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={decisionForm.conviction_score}
                    onChange={(e) =>
                      setDecisionForm({
                        ...decisionForm,
                        conviction_score: parseInt(e.target.value, 10) || 6,
                      })
                    }
                    style={{ ...inputStyle, marginTop: 4, maxWidth: 60 }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={decisionForm.action_taken}
                    onChange={(e) => setDecisionForm({ ...decisionForm, action_taken: e.target.checked })}
                  />
                  Action taken
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setDecisionFormOpen(false)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', color: '#7a8fa8' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveDecision()}
                  disabled={savingDecision}
                  style={{
                    padding: '8px 20px',
                    background: '#ffd700',
                    color: '#080a0f',
                    border: 'none',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 10,
                    letterSpacing: 2,
                    fontWeight: 700,
                    cursor: savingDecision ? 'wait' : 'pointer',
                  }}
                >
                  {savingDecision ? 'SAVING…' : 'SAVE'}
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <Skeleton height={120} />
        ) : decisions.length === 0 ? (
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068', textAlign: 'center', padding: 24 }}>
            No decisions logged yet — start building your audit trail
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {decisions.map((d) => {
              const dc = DECISION_COLORS[d.decision_type] || DECISION_COLORS.pass;
              return (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '12px 14px',
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', minWidth: 80 }}>
                    {new Date(d.decision_date).toLocaleDateString()}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: dc.color,
                      background: dc.bg,
                      border: `1px solid ${dc.border}`,
                      padding: '2px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {d.decision_type.toUpperCase()}
                  </span>
                  {d.ticker && (
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#ffd700' }}>
                      {d.ticker}
                    </span>
                  )}
                  {d.conviction_score != null && (
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#7a8fa8' }}>
                      Conviction {d.conviction_score}/10
                    </span>
                  )}
                  {d.action_taken && (
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#00ff88' }}>✓</span>
                  )}
                  <span style={{ flex: 1, fontSize: 12, color: '#7a8fa8', lineHeight: 1.5, minWidth: 200 }}>
                    {d.rationale}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
