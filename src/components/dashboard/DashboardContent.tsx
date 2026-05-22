'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import MorningBriefing from '@/components/dashboard/MorningBriefing';
import SignalCard from '@/components/dashboard/SignalCard';
import AgentStatus from '@/components/dashboard/AgentStatus';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import type { ScanResult } from '@/lib/agents/scanner';
import type { MorningBriefing as MorningBriefingData } from '@/lib/agents/briefing';
import type { Agent } from '@/types';
import { Loader2 } from 'lucide-react';

const BASE_AGENTS: Agent[] = [
  { id: '1', name: 'Market Scanner', type: 'scanner', status: 'standby' },
  { id: '2', name: 'Thesis Builder', type: 'thesis', status: 'standby' },
  { id: '3', name: 'Risk Manager', type: 'risk', status: 'standby' },
  { id: '4', name: 'Pattern Analyst', type: 'pattern', status: 'standby' },
  { id: '5', name: 'Briefing Agent', type: 'briefing', status: 'standby' },
  { id: '6', name: 'Trade Logger', type: 'journal', status: 'standby' },
];

const SCAN_INTERVAL_MS = 5 * 60 * 1000;

const EARNINGS_WATCHLIST = ['NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL'];

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

function formatMoney(val: string | number) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function DashboardContent() {
  const [signals, setSignals] = useState<ScanResult[]>([]);
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const [scanLoading, setScanLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [scanLastRun, setScanLastRun] = useState<string | null>(null);
  const [briefingLastRun, setBriefingLastRun] = useState<string | null>(null);
  const [scanUpdatedAt, setScanUpdatedAt] = useState<string | null>(null);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(true);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const res = await fetch('/api/briefing');
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
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    setAccountLoading(true);
    try {
      const res = await fetch('/api/trading/account');
      const data = await res.json();
      if (res.ok) setAccount(data);
    } catch {
      // silent
    } finally {
      setAccountLoading(false);
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

  const fetchScan = useCallback(async () => {
    setScanLoading(true);
    setScanError(null);
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      if (!res.ok) {
        setSignals([]);
        setScanError(data.error || 'Scanner failed');
        return;
      }
      setSignals(data.signals || []);
      setScanLastRun(data.scanned_at);
      setScanUpdatedAt(data.scanned_at);
    } catch {
      setSignals([]);
      setScanError('Scanner offline');
    } finally {
      setScanLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
    fetchScan();
    fetchAccount();
    fetchEarnings();

    const interval = setInterval(fetchScan, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBriefing, fetchScan, fetchAccount, fetchEarnings]);

  useEffect(() => {
    const onPullRefresh = () => {
      fetchBriefing();
      fetchScan();
      fetchAccount();
      fetchEarnings();
    };
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, [fetchBriefing, fetchScan, fetchAccount, fetchEarnings]);

  const highConviction = signals.filter((s) => s.strength === 'high').length;
  const alertsToday = signals.filter((s) => {
    const scanned = new Date(s.scanned_at);
    const today = new Date();
    return scanned.toDateString() === today.toDateString();
  }).length;

  const agents: Agent[] = BASE_AGENTS.map((agent) => {
    if (agent.type === 'scanner') {
      return {
        ...agent,
        status: scanError ? 'error' : scanLoading ? 'active' : 'standby',
        last_run: scanLastRun || undefined,
      };
    }
    if (agent.type === 'briefing') {
      return {
        ...agent,
        status: briefingError ? 'error' : briefingLoading ? 'active' : 'standby',
        last_run: briefingLastRun || undefined,
      };
    }
    return agent;
  });

  const strengthVariant = (strength: string) => {
    if (strength === 'high') return 'green' as const;
    if (strength === 'medium') return 'yellow' as const;
    return 'muted' as const;
  };

  const dayPnl = account ? parseFloat(account.equity) - parseFloat(account.last_equity) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const formatEarningsDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const earningsTiming = (hour?: string) => {
    if (hour === 'bmo') return 'PRE';
    if (hour === 'amc') return 'POST';
    return 'TBD';
  };

  const earningsBorderColor = (dateStr: string) => {
    if (dateStr === todayStr) return '#00ff88';
    if (dateStr === tomorrowStr) return '#ffd700';
    return '#1e2a3a';
  };

  return (
    <div className="space-y-6">
      <MorningBriefing
        loading={briefingLoading}
        briefing={briefing}
        agentStatus={
          briefingError ? 'error' : briefingLoading ? 'active' : 'standby'
        }
        lastUpdated={briefingLastRun}
        error={briefingError}
        onRetry={fetchBriefing}
      />

      <Link href="/earnings" className="block">
        <Card className="border-l-2 border-l-accent-yellow">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-mono text-[8px] uppercase tracking-[3px] text-text-muted">
              THIS WEEK&apos;S CATALYSTS
            </div>
            <span className="font-mono text-[9px] text-accent-green">View calendar →</span>
          </div>
          {earningsLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 w-28 shrink-0 animate-pulse rounded-full bg-bg-elevated" />
              ))}
            </div>
          ) : earnings.length === 0 ? (
            <p className="text-sm text-text-secondary">No watchlist earnings this week</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {earnings.map((event) => (
                <span
                  key={`${event.symbol}-${event.date}`}
                  className="shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-wide text-text-primary"
                  style={{ borderColor: earningsBorderColor(event.date) }}
                >
                  {event.symbol} · {formatEarningsDate(event.date)} · {earningsTiming(event.hour)}
                </span>
              ))}
            </div>
          )}
        </Card>
      </Link>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SignalCard label="Active Signals" value={signals.length} accent="green" />
        <SignalCard label="High Conviction" value={highConviction} accent="yellow" />
        <SignalCard label="Alerts Today" value={alertsToday} accent="blue" />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-text-primary">Recent Signals</h2>
          <div className="flex items-center gap-3">
            {scanLoading && <Loader2 className="h-4 w-4 animate-spin text-accent-green" />}
            {scanUpdatedAt && !scanError && (
              <span className="font-mono text-xs text-text-muted">
                Updated {new Date(scanUpdatedAt).toLocaleTimeString()}
              </span>
            )}
            {scanError && (
              <Button variant="secondary" size="sm" onClick={fetchScan}>
                Retry Scan
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-muted">
                <th className="pb-3 pr-4 font-medium">Ticker</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Signal Strength</th>
                <th className="hidden pb-3 pr-4 font-medium md:table-cell">Agent</th>
                <th className="hidden pb-3 font-medium md:table-cell">Time</th>
              </tr>
            </thead>
            <tbody>
              {scanLoading && signals.length === 0 && !scanError ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-text-secondary">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
                      Market Scanner is running…
                    </div>
                  </td>
                </tr>
              ) : scanError && signals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <p className="text-sm text-accent-red">Scanner offline — retrying…</p>
                    <Button variant="secondary" size="sm" className="mt-4" onClick={fetchScan}>
                      Retry Scan
                    </Button>
                  </td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-text-secondary">
                    Recon agents are warming up. Signals will appear here.
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <tr
                    key={`${signal.ticker}-${signal.scanned_at}`}
                    className="border-b border-border/50"
                  >
                    <td className="py-3 pr-4 font-mono font-bold text-text-primary">
                      {signal.ticker}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {signal.signal_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={strengthVariant(signal.strength)}>{signal.strength}</Badge>
                    </td>
                    <td className="hidden py-3 pr-4 text-text-secondary md:table-cell">
                      Market Scanner
                    </td>
                    <td className="hidden py-3 font-mono text-xs text-text-muted md:table-cell">
                      {new Date(signal.scanned_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {signals.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {signals.map((signal) => (
              <p key={`summary-${signal.ticker}`} className="text-xs text-text-muted">
                <span className="font-mono font-bold text-text-secondary">{signal.ticker}</span>
                {' — '}
                {signal.summary}
              </p>
            ))}
          </div>
        )}
      </Card>

      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold text-text-primary">Agent Status</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {agents.map((agent) => (
            <AgentStatus key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      <Link href="/portfolio" className="block">
        <Card className="border-l-2 border-l-accent-green transition-colors hover:border-border-hover">
          <div className="mb-3 font-mono text-[8px] uppercase tracking-[3px] text-text-muted">
            PAPER ACCOUNT
          </div>
          {accountLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-bg-elevated" />
              ))}
            </div>
          ) : account ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Portfolio Value', value: formatMoney(account.equity) },
                { label: 'Cash', value: formatMoney(account.cash) },
                {
                  label: 'Day P&L',
                  value: formatMoney(dayPnl),
                  color: dayPnl >= 0 ? 'text-accent-green' : 'text-accent-red',
                },
                { label: 'Buying Power', value: formatMoney(account.buying_power) },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-text-muted">
                    {stat.label}
                  </div>
                  <div className={`font-mono text-sm font-bold ${stat.color || 'text-text-primary'}`}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Paper account unavailable — view portfolio →</p>
          )}
        </Card>
      </Link>
    </div>
  );
}
