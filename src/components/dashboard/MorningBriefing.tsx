'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import type { MorningBriefing as MorningBriefingData } from '@/lib/agents/briefing';
import { Loader2 } from 'lucide-react';

interface MorningBriefingProps {
  loading?: boolean;
  briefing?: MorningBriefingData | null;
  agentStatus?: 'active' | 'standby' | 'error';
  lastUpdated?: string | null;
  error?: string | null;
  onRetry?: () => void;
}

const sentimentVariant = {
  risk_on: 'green' as const,
  risk_off: 'red' as const,
  neutral: 'muted' as const,
  volatile: 'yellow' as const,
};

export default function MorningBriefing({
  loading = false,
  briefing = null,
  agentStatus = 'standby',
  lastUpdated = null,
  error = null,
  onRetry,
}: MorningBriefingProps) {
  const badgeVariant =
    agentStatus === 'active' ? 'green' : agentStatus === 'error' ? 'red' : 'muted';

  return (
    <Card accent="green" className="relative overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-semibold text-text-primary">
              Morning Briefing
            </h2>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-accent-green" />}
          </div>

          {loading && !briefing && !error && (
            <p className="text-sm text-text-secondary">Briefing Agent is analyzing market data…</p>
          )}

          {error && !loading && (
            <div className="space-y-3 rounded-md border border-accent-red/40 bg-accent-red-dim p-4">
              <p className="text-sm text-accent-red">Briefing unavailable — click to retry</p>
              {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Retry Briefing
                </Button>
              )}
            </div>
          )}

          {!loading && !briefing && !error && (
            <p className="text-sm text-text-secondary">
              Your 6AM briefing will appear here once the agent runs.
            </p>
          )}

          {briefing && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sentimentVariant[briefing.sentiment]}>
                  {briefing.sentiment.replace('_', ' ')}
                </Badge>
                <Badge variant="blue">{briefing.market_status}</Badge>
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-[1.7] text-text-secondary md:text-sm md:leading-relaxed">
                {briefing.briefing_text}
              </div>
              {briefing.key_levels.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {briefing.key_levels.map((level) => (
                    <div
                      key={level.label}
                      className="rounded-md border border-border bg-bg-secondary px-3 py-2"
                    >
                      <p className="font-mono text-xs text-text-muted">{level.label}</p>
                      <p className="font-mono text-sm font-bold text-text-primary">{level.value}</p>
                      <p className="text-xs text-text-secondary">{level.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {lastUpdated && briefing && (
            <p className="font-mono text-xs text-text-muted">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>

        <Badge variant={badgeVariant}>
          {agentStatus === 'active' && (
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-dot" />
          )}
          Briefing Agent — {agentStatus}
        </Badge>
      </div>
    </Card>
  );
}
