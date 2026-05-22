'use client';

import { useState } from 'react';
import type { MorningBriefing as MorningBriefingData } from '@/lib/agents/briefing';
import { Loader2 } from 'lucide-react';

interface MorningBriefingProps {
  loading?: boolean;
  briefing?: MorningBriefingData | null;
  agentStatus?: 'active' | 'standby' | 'error';
  lastUpdated?: string | null;
  error?: string | null;
  onRetry?: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

const SENTIMENT_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  risk_on: { label: 'RISK ON', color: '#00ff88', bg: '#00ff8815', border: '#00ff8840' },
  risk_off: { label: 'RISK OFF', color: '#ff3d5a', bg: '#ff3d5a15', border: '#ff3d5a40' },
  neutral: { label: 'NEUTRAL', color: '#7a8fa8', bg: '#7a8fa815', border: '#7a8fa840' },
  volatile: { label: 'VOLATILE', color: '#ffd700', bg: '#ffd70015', border: '#ffd70040' },
};

function levelColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes('support')) return '#00ff88';
  if (l.includes('resist')) return '#ff3d5a';
  return '#ffd700';
}

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

export default function MorningBriefing({
  loading = false,
  briefing = null,
  agentStatus = 'standby',
  lastUpdated = null,
  error = null,
  onRetry,
  onRegenerate,
  regenerating = false,
}: MorningBriefingProps) {
  const [expanded, setExpanded] = useState(false);

  const paragraphs = briefing?.briefing_text
    ? briefing.briefing_text.split('\n\n').filter(Boolean)
    : [];
  const sentiment = briefing ? SENTIMENT_STYLES[briefing.sentiment] || SENTIMENT_STYLES.neutral : null;

  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderRadius: 10,
        padding: '20px 24px',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 3,
              color: '#00ff88',
            }}
          >
            MORNING BRIEFING
          </span>
          {sentiment && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                fontWeight: 700,
                color: sentiment.color,
                background: sentiment.bg,
                border: `1px solid ${sentiment.border}`,
                padding: '2px 10px',
                borderRadius: 20,
              }}
            >
              {sentiment.label}
            </span>
          )}
          {briefing && (
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
              {briefing.date}
            </span>
          )}
          {loading && !briefing && <Loader2 className="h-3 w-3 animate-spin text-accent-green" />}
        </div>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating || loading}
            style={{
              background: 'transparent',
              border: '1px solid #1e2a3a',
              borderRadius: 6,
              color: '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 14,
              padding: '4px 10px',
              cursor: regenerating ? 'not-allowed' : 'pointer',
            }}
            title="Regenerate briefing"
          >
            {regenerating ? '…' : '↻'}
          </button>
        )}
      </div>

      {loading && !briefing && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-bg-elevated" style={{ width: `${100 - i * 15}%` }} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 12, background: '#ff3d5a10', border: '1px solid #ff3d5a40', borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: '#ff8fa0', marginBottom: 8 }}>Briefing unavailable</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: '6px 12px',
                background: '#1e2a3a',
                border: 'none',
                borderRadius: 6,
                color: '#e8edf5',
                fontFamily: 'monospace',
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              RETRY
            </button>
          )}
        </div>
      )}

      {briefing && paragraphs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 15, color: '#e8edf5', lineHeight: 1.7, marginBottom: 12 }}>
            {paragraphs[0]}
          </p>
          {paragraphs.length > 1 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#3d9aff',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 1,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Read more ▾
            </button>
          )}
          {expanded &&
            paragraphs.slice(1).map((p, i) => (
              <p key={i} style={{ fontSize: 13, color: '#7a8fa8', lineHeight: 1.7, marginBottom: 10 }}>
                {p}
              </p>
            ))}
          {expanded && paragraphs.length > 1 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#3d9aff',
                fontFamily: 'monospace',
                fontSize: 10,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Show less ▴
            </button>
          )}
        </div>
      )}

      {briefing && briefing.key_levels.length > 0 && (
        <div
          className="mb-4 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
          style={{ marginBottom: 16 }}
        >
          {briefing.key_levels.map((level) => (
            <span
              key={level.label}
              className="shrink-0 rounded-md border px-3 py-1.5 font-mono text-[9px]"
              style={{
                borderColor: `${levelColor(level.label)}40`,
                color: levelColor(level.label),
                background: `${levelColor(level.label)}10`,
              }}
            >
              {level.label} · {level.value} · {level.note}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #1e2a3a40',
          paddingTop: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
          {lastUpdated ? `Generated ${minutesAgo(lastUpdated)}` : 'Not yet generated'}
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 1,
            color: agentStatus === 'active' ? '#00ff88' : agentStatus === 'error' ? '#ff3d5a' : '#7a8fa8',
          }}
        >
          BRIEFING AGENT · {agentStatus === 'active' ? 'ACTIVE' : agentStatus === 'error' ? 'ERROR' : 'STANDBY'}
        </span>
      </div>
    </div>
  );
}
