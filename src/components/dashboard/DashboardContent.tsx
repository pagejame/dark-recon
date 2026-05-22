'use client';

import { useCallback, useEffect, useState } from 'react';
import MarketStatusBar from '@/components/dashboard/MarketStatusBar';
import MorningBriefing from '@/components/dashboard/MorningBriefing';
import PortfolioSnapshot from '@/components/dashboard/PortfolioSnapshot';
import TopSignalsRow from '@/components/dashboard/TopSignalsRow';
import CatalystsWidget from '@/components/dashboard/CatalystsWidget';
import AgentStatusGrid, { type AgentCardData } from '@/components/dashboard/AgentStatusGrid';
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

export default function DashboardContent() {
  const [signals, setSignals] = useState<ScanResult[]>([]);
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [thesesToday, setThesesToday] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);

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

  const loadAll = useCallback(() => {
    void Promise.allSettled([
      fetchBriefing(),
      fetchScan(),
      fetchPortfolio(),
      fetchPositions(),
      fetchEarnings(),
      fetchAgentStats(),
    ]);
  }, [
    fetchBriefing,
    fetchScan,
    fetchPortfolio,
    fetchPositions,
    fetchEarnings,
    fetchAgentStats,
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

  return (
    <div className="flex flex-col gap-4">
      <MarketStatusBar briefing={briefing} earnings={earnings} spyDisplay={spySignal ? `SPY · ${spySignal.summary.slice(0, 30)}…` : undefined} />

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
    </div>
  );
}
