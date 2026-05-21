'use client';

import { useCallback, useEffect, useState } from 'react';
import MorningBriefing from '@/components/dashboard/MorningBriefing';
import SignalCard from '@/components/dashboard/SignalCard';
import AgentStatus from '@/components/dashboard/AgentStatus';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
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

export default function DashboardContent() {
  const [signals, setSignals] = useState<ScanResult[]>([]);
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const [scanLoading, setScanLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [scanLastRun, setScanLastRun] = useState<string | null>(null);
  const [briefingLastRun, setBriefingLastRun] = useState<string | null>(null);
  const [scanUpdatedAt, setScanUpdatedAt] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch('/api/briefing');
      if (res.ok) {
        const data: MorningBriefingData = await res.json();
        setBriefing(data);
        setBriefingLastRun(data.generated_at);
      }
    } catch {
      // Briefing fetch failed silently; card shows fallback state
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const fetchScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals || []);
        setScanLastRun(data.scanned_at);
        setScanUpdatedAt(data.scanned_at);
      }
    } catch {
      // Scan fetch failed silently; table shows empty state
    } finally {
      setScanLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
    fetchScan();

    const interval = setInterval(fetchScan, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBriefing, fetchScan]);

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
        status: scanLoading ? 'active' : 'standby',
        last_run: scanLastRun || undefined,
      };
    }
    if (agent.type === 'briefing') {
      return {
        ...agent,
        status: briefingLoading ? 'active' : 'standby',
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

  return (
    <div className="space-y-6">
      <MorningBriefing
        loading={briefingLoading}
        briefing={briefing}
        agentStatus={briefingLoading ? 'active' : 'standby'}
        lastUpdated={briefingLastRun}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SignalCard label="Active Signals" value={signals.length} accent="green" />
        <SignalCard label="High Conviction" value={highConviction} accent="yellow" />
        <SignalCard label="Alerts Today" value={alertsToday} accent="blue" />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-text-primary">Recent Signals</h2>
          <div className="flex items-center gap-3">
            {scanLoading && <Loader2 className="h-4 w-4 animate-spin text-accent-green" />}
            {scanUpdatedAt && (
              <span className="font-mono text-xs text-text-muted">
                Updated {new Date(scanUpdatedAt).toLocaleTimeString()}
              </span>
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
                <th className="pb-3 pr-4 font-medium">Agent</th>
                <th className="pb-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {scanLoading && signals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-text-secondary">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
                      Market Scanner is running…
                    </div>
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
                  <tr key={`${signal.ticker}-${signal.scanned_at}`} className="border-b border-border/50">
                    <td className="py-3 pr-4 font-mono font-bold text-text-primary">
                      {signal.ticker}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {signal.signal_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={strengthVariant(signal.strength)}>{signal.strength}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">Market Scanner</td>
                    <td className="py-3 font-mono text-xs text-text-muted">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentStatus key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  );
}
