'use client';

import { useCallback, useEffect, useState } from 'react';
import MarketStatusBar from '@/components/dashboard/MarketStatusBar';
import MorningBriefing from '@/components/dashboard/MorningBriefing';
import PortfolioSnapshot from '@/components/dashboard/PortfolioSnapshot';
import TopSignalsRow from '@/components/dashboard/TopSignalsRow';
import CatalystsWidget from '@/components/dashboard/CatalystsWidget';
import AgentStatusGrid, { type AgentCardData } from '@/components/dashboard/AgentStatusGrid';
import CronStatusWidget from '@/components/dashboard/CronStatusWidget';
import TradeQueuePreview from '@/components/dashboard/TradeQueuePreview';
import type { ScanResult } from '@/lib/agents/scanner';
import type { MorningBriefing as MorningBriefingData } from '@/lib/agents/briefing';

const EARNINGS_WATCHLIST = ['NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL'];
const SCAN_INTERVAL_MS = 5 * 60 * 1000;

interface EarningsEvent {
  symbol: string;
  date: string;
  hour?: string;
}

interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  last_equity: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
}

interface SavedThesis {
  generated_at: string;
}

interface TriggeredAlert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  current_price?: number;
}

interface AutopilotPreview {
  overall_action: 'aggressive' | 'moderate' | 'defensive' | 'hold';
  report_text: string;
  action_items: { priority: string; action: string; ticker?: string }[];
  generated_at: string;
}

interface PositionAlertItem {
  id?: string;
  ticker: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

export default function DashboardContent() {
  const [signals, setSignals] = useState<ScanResult[]>([]);
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [thesesToday, setThesesToday] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotPreview | null>(null);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [positionAlerts, setPositionAlerts] = useState<PositionAlertItem[]>([]);

  const [scanLoading, setScanLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingRegenerating, setBriefingRegenerating] = useState(false);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const [scanError, setScanError] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [scanLastRun, setScanLastRun] = useState<string | null>(null);
  const [briefingLastRun, setBriefingLastRun] = useState<string | null>(null);

  const fetchBriefing = useCallback(async (refresh = false) => {
    if (refresh) setBriefingRegenerating(true);
    else setBriefingLoading(true);
    setBriefingError(null);
    try {
      const url = refresh ? '/api/briefing?refresh=true' : '/api/briefing';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setBriefing(null);
        setBriefingError(data.error || 'Briefing failed');
        return;
      }
      setBriefing(data);
      setBriefingLastRun(data.generated_at);
    } catch {
      setBriefing(null);
      setBriefingError('Briefing unavailable');
    } finally {
      setBriefingLoading(false);
      setBriefingRegenerating(false);
    }
  }, []);

  const fetchScan = useCallback(async (fresh = false) => {
    if (fresh) setScanning(true);
    else setScanLoading(true);
    setScanError(null);
    try {
      const res = await fetch(fresh ? '/api/scan?fresh=true' : '/api/scan');
      const data = await res.json();
      if (!res.ok) {
        setSignals([]);
        setScanError(data.error || 'Scanner failed');
        return;
      }
      setSignals(data.signals || []);
      setScanLastRun(data.scanned_at);
    } catch {
      setSignals([]);
      setScanError('Scanner offline');
    } finally {
      setScanLoading(false);
      setScanning(false);
    }
  }, []);

  const fetchPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const res = await fetch('/api/trading/account');
      const data = await res.json();
      if (res.ok) setAccount(data);
    } catch {
      // silent
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true);
    try {
      const res = await fetch('/api/trading/positions');
      const data = await res.json();
      setPositions(data.positions || []);
    } catch {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  const fetchEarnings = useCallback(async () => {
    setEarningsLoading(true);
    try {
      const res = await fetch('/api/earnings?days=7');
      const data = await res.json();
      const filtered = (data.earnings || []).filter((e: EarningsEvent) =>
        EARNINGS_WATCHLIST.includes(e.symbol)
      );
      setEarnings(filtered);
    } catch {
      setEarnings([]);
    } finally {
      setEarningsLoading(false);
    }
  }, []);

  const fetchAgentStats = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const [thesesRes, ordersRes] = await Promise.allSettled([
        fetch('/api/thesis'),
        fetch('/api/trading/orders'),
      ]);

      if (thesesRes.status === 'fulfilled' && thesesRes.value.ok) {
        const data = await thesesRes.value.json();
        const today = new Date().toDateString();
        const count = (data.theses || []).filter(
          (t: SavedThesis) => new Date(t.generated_at).toDateString() === today
        ).length;
        setThesesToday(count);
      }

      if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
        const data = await ordersRes.value.json();
        const filled = (data.orders || []).filter(
          (o: { status: string }) => o.status === 'filled'
        ).length;
        setTradeCount(filled);
      }
    } catch {
      // silent
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const checkAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/check');
      const data = await res.json();
      setTriggeredAlerts(data.triggered || []);
    } catch {
      setTriggeredAlerts([]);
    }
  }, []);

  const fetchAutopilot = useCallback(async (refresh = false) => {
    if (refresh) setAutopilotRunning(true);
    else setAutopilotLoading(true);
    try {
      const url = refresh ? '/api/autopilot?refresh=true' : '/api/autopilot';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && !data.error) setAutopilot(data);
    } catch {
      // non-blocking
    } finally {
      setAutopilotLoading(false);
      setAutopilotRunning(false);
    }
  }, []);

  const fetchPositionAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/alerts');
      const data = await res.json();
      setPositionAlerts(data.alerts || []);
    } catch {
      setPositionAlerts([]);
    }
  }, []);

  const loadAll = useCallback(() => {
    void Promise.allSettled([
      fetchBriefing(),
      fetchScan(),
      fetchPortfolio(),
      fetchPositions(),
      fetchEarnings(),
      fetchAgentStats(),
      checkAlerts(),
      fetchAutopilot(),
      fetchPositionAlerts(),
    ]);
  }, [
    fetchBriefing,
    fetchScan,
    fetchPortfolio,
    fetchPositions,
    fetchEarnings,
    fetchAgentStats,
    checkAlerts,
    fetchAutopilot,
    fetchPositionAlerts,
  ]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => fetchScan(), SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadAll, fetchScan]);

  useEffect(() => {
    const onPullRefresh = () => loadAll();
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [loadAll]);

  const briefingAgentStatus = briefingError
    ? 'error'
    : briefingLoading || briefingRegenerating
      ? 'active'
      : 'standby';

  const scannerAgentStatus = scanError ? 'error' : scanLoading || scanning ? 'active' : 'standby';

  const sentimentLabel = briefing?.sentiment
    ? briefing.sentiment.replace('_', ' ').toUpperCase()
    : '—';

  const agents: AgentCardData[] = [
    {
      id: '1',
      name: 'Market Scanner',
      type: 'scanner',
      status: scannerAgentStatus,
      last_run: scanLastRun || undefined,
      description: 'Scans 10 tickers for unusual activity',
      metric: `${signals.length} signals · last scan ${scanLastRun ? new Date(scanLastRun).toLocaleTimeString() : '—'}`,
    },
    {
      id: '2',
      name: 'Thesis Builder',
      type: 'thesis',
      status: 'standby',
      description: 'Builds AI investment thesis with real data',
      metric: `${thesesToday} theses generated today`,
    },
    {
      id: '3',
      name: 'Briefing Agent',
      type: 'briefing',
      status: briefingAgentStatus,
      last_run: briefingLastRun || undefined,
      description: 'Generates pre-market intelligence briefing',
      metric: `${sentimentLabel}${briefingLastRun ? ` · ${new Date(briefingLastRun).toLocaleTimeString()}` : ''}`,
    },
    {
      id: '4',
      name: 'Risk Manager',
      type: 'risk',
      status: 'standby',
      description: 'Calculates position sizing per trade',
      metric: '5% max per high conviction',
    },
    {
      id: '5',
      name: 'Pattern Analyst',
      type: 'pattern',
      status: 'standby',
      description: 'Identifies technical chart patterns',
      metric: 'Coming soon',
    },
    {
      id: '6',
      name: 'Trade Logger',
      type: 'journal',
      status: 'standby',
      description: 'Logs and tracks all executed trades',
      metric: `${tradeCount} trades logged`,
    },
  ];

  const spySignal = signals.find((s) => s.ticker === 'SPY');

  const autopilotActionColors: Record<string, { color: string; bg: string; border: string }> = {
    aggressive: { color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
    moderate: { color: '#3d9aff', bg: '#3d9aff15', border: '#3d9aff40' },
    defensive: { color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
    hold: { color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' },
  };

  const autopilotPreview =
    autopilot?.report_text?.split('\n\n')[0]?.replace(/^AUTOPILOT —[^\n]*\n?/, '') || '';
  const autopilotTruncated =
    autopilotPreview.length > 200 ? `${autopilotPreview.slice(0, 200)}…` : autopilotPreview;

  return (
    <div className="flex flex-col gap-4">
      <MarketStatusBar briefing={briefing} earnings={earnings} spyDisplay={spySignal ? `SPY · ${spySignal.summary.slice(0, 30)}…` : undefined} />

      {positionAlerts.filter((a) => a.severity === 'critical').length > 0 && (
        <div
          style={{
            background: '#ff3d5a10',
            border: '1px solid #ff3d5a40',
            borderLeft: '3px solid #ff3d5a',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🚨</span>
            <div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#ff3d5a',
                  letterSpacing: 1,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                POSITION ALERT — ACTION REQUIRED
              </div>
              {positionAlerts
                .filter((a) => a.severity === 'critical')
                .map((a, i) => (
                  <div key={a.id || i} style={{ fontSize: 13, color: '#e8edf5', marginBottom: 2 }}>
                    {a.message}
                  </div>
                ))}
            </div>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/monitor/alerts', { method: 'PATCH' });
              setPositionAlerts([]);
            }}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid #ff3d5a40',
              borderRadius: 6,
              color: '#ff3d5a',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              cursor: 'pointer',
            }}
          >
            DISMISS
          </button>
        </div>
      )}

      {positionAlerts.filter((a) => a.severity === 'warning').length > 0 &&
        positionAlerts.filter((a) => a.severity === 'critical').length === 0 && (
          <div
            style={{
              background: '#ffd70010',
              border: '1px solid #ffd70030',
              borderLeft: '3px solid #ffd700',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#ffd700',
                letterSpacing: 2,
                marginBottom: 8,
              }}
            >
              POSITION WARNINGS
            </div>
            {positionAlerts
              .filter((a) => a.severity === 'warning')
              .map((a, i) => (
                <div key={a.id || i} style={{ fontSize: 13, color: '#7a8fa8', marginBottom: 4 }}>
                  {a.message}
                </div>
              ))}
          </div>
        )}

      {triggeredAlerts.length > 0 && (
        <div
          style={{
            background: '#ffd70015',
            border: '1px solid #ffd70040',
            borderLeft: '3px solid #ffd700',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: '#ffd700',
                letterSpacing: 1,
              }}
            >
              {triggeredAlerts.length} PRICE ALERT{triggeredAlerts.length > 1 ? 'S' : ''} TRIGGERED
            </span>
            <span style={{ fontSize: 13, color: '#e8edf5' }}>
              {triggeredAlerts
                .map((a) => `${a.ticker} ${a.condition} $${a.target_price}`)
                .join(' · ')}
            </span>
          </div>
          <a
            href="/alerts"
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#ffd700',
              letterSpacing: 2,
              textDecoration: 'none',
              background: '#ffd70015',
              border: '1px solid #ffd70040',
              padding: '4px 12px',
              borderRadius: 6,
            }}
          >
            VIEW ALERTS →
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="order-1 lg:order-2 lg:col-span-2 lg:col-start-4">
          <PortfolioSnapshot
            account={account}
            positions={positions}
            loading={portfolioLoading || positionsLoading}
          />
        </div>
        <div className="order-2 lg:order-1 lg:col-span-3">
          <MorningBriefing
            loading={briefingLoading}
            briefing={briefing}
            agentStatus={briefingAgentStatus}
            lastUpdated={briefingLastRun}
            error={briefingError}
            onRetry={() => fetchBriefing()}
            onRegenerate={() => fetchBriefing(true)}
            regenerating={briefingRegenerating}
          />
        </div>
      </div>

      {/* Autopilot Preview */}
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderLeft: '3px solid #00ff88',
          borderRadius: 10,
          padding: '16px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 3,
                color: '#00ff88',
              }}
            >
              AUTOPILOT
            </span>
            {autopilot && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 1,
                  color: autopilotActionColors[autopilot.overall_action]?.color || '#7a8fa8',
                  background: autopilotActionColors[autopilot.overall_action]?.bg,
                  border: `1px solid ${autopilotActionColors[autopilot.overall_action]?.border}`,
                  padding: '2px 10px',
                  borderRadius: 20,
                }}
              >
                {autopilot.overall_action.toUpperCase()}
              </span>
            )}
          </div>
          <a
            href="/autopilot"
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#00ff88',
              letterSpacing: 1,
              textDecoration: 'none',
            }}
          >
            View Full Report →
          </a>
        </div>

        {autopilotLoading ? (
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#3d5068' }}>Loading…</div>
        ) : autopilot ? (
          <>
            <p style={{ fontSize: 13, color: '#7a8fa8', lineHeight: 1.6, margin: '0 0 12px' }}>
              {autopilotTruncated}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(autopilot.action_items || []).slice(0, 2).map((item, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: '#e8edf5',
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    padding: '4px 10px',
                    borderRadius: 6,
                  }}
                >
                  {item.ticker ? `${item.ticker}: ` : ''}
                  {item.action}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#7a8fa8' }}>
              Run Autopilot to get your daily action plan
            </span>
            <button
              onClick={() => fetchAutopilot(true)}
              disabled={autopilotRunning}
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 2,
                color: '#00ff88',
                background: '#00ff8815',
                border: '1px solid #00ff8840',
                padding: '6px 14px',
                borderRadius: 6,
                cursor: autopilotRunning ? 'wait' : 'pointer',
              }}
            >
              {autopilotRunning ? 'RUNNING…' : 'RUN'}
            </button>
          </div>
        )}
      </div>

      <TradeQueuePreview />

      <TopSignalsRow
        signals={signals}
        loading={scanLoading}
        onRunScan={() => fetchScan(true)}
        scanning={scanning}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CatalystsWidget earnings={earnings} loading={earningsLoading} />
        </div>
        <div className="lg:col-span-2">
          <AgentStatusGrid agents={agents} loading={agentsLoading} />
        </div>
      </div>

      <CronStatusWidget />
    </div>
  );
}
