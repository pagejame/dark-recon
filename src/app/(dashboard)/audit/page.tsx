'use client';

import { useState, useEffect, useCallback } from 'react';

interface AuditEvent {
  id: string;
  event_type: string;
  ticker?: string;
  action_taken: string;
  rationale?: string;
  source: string;
  outcome?: string;
  event_at: string;
  raw_data?: Record<string, unknown>;
  signal_sources?: string[];
  conviction_score?: number;
  dollar_amount?: number;
  pnl_dollar?: number;
  pnl_pct?: number;
}

interface AuditStats {
  total: number;
  trades: number;
  signals: number;
  decisions: number;
}

type CategoryFilter = 'ALL' | 'TRADES' | 'SIGNALS' | 'AUTOPILOT' | 'CONGRESSIONAL' | 'SYSTEM';
type DaysFilter = 0 | 1 | 7 | 30;

const TRADE_EVENTS = ['trade_executed', 'trade_approved', 'trade_rejected', 'position_opened', 'position_closed'];
const SIGNAL_EVENTS = ['signal_fired', 'signal_confirmed', 'signal_passed'];
const AUTOPILOT_EVENTS = ['autopilot_generated', 'autopilot_action_taken'];
const CONGRESSIONAL_EVENTS = ['congressional_trade_reviewed'];
const SYSTEM_EVENTS = [
  'site_scan_run',
  'task_executed',
  'system_health_checked',
  'stop_loss_triggered',
  'stop_loss_created',
  'price_alert_triggered',
  'price_alert_created',
  'rebalance_triggered',
  'trade_queue_built',
  'manual_override',
  'earnings_play_queued',
  'intelligence_signal_acted',
];

const CATEGORY_EVENTS: Record<CategoryFilter, string[] | null> = {
  ALL: null,
  TRADES: TRADE_EVENTS,
  SIGNALS: SIGNAL_EVENTS,
  AUTOPILOT: AUTOPILOT_EVENTS,
  CONGRESSIONAL: CONGRESSIONAL_EVENTS,
  SYSTEM: SYSTEM_EVENTS,
};

function eventCategory(type: string): Exclude<CategoryFilter, 'ALL'> {
  if (TRADE_EVENTS.includes(type)) return 'TRADES';
  if (SIGNAL_EVENTS.includes(type)) return 'SIGNALS';
  if (AUTOPILOT_EVENTS.includes(type)) return 'AUTOPILOT';
  if (CONGRESSIONAL_EVENTS.includes(type)) return 'CONGRESSIONAL';
  return 'SYSTEM';
}

function eventTypeColor(type: string): { bg: string; border: string; color: string; label: string } {
  const cat = eventCategory(type);
  const map = {
    TRADES: { bg: '#00ff8815', border: '#00ff8840', color: '#00ff88', label: 'TRADE' },
    SIGNALS: { bg: '#3d9aff15', border: '#3d9aff40', color: '#3d9aff', label: 'SIGNAL' },
    AUTOPILOT: { bg: '#a855f715', border: '#a855f740', color: '#a855f7', label: 'AUTOPILOT' },
    CONGRESSIONAL: { bg: '#ffd70015', border: '#ffd70040', color: '#ffd700', label: 'CONGRESS' },
    SYSTEM: { bg: '#7a8fa815', border: '#7a8fa840', color: '#7a8fa8', label: 'SYSTEM' },
  };
  return map[cat];
}

function outcomeStyle(outcome?: string) {
  const o = outcome || 'pending';
  if (o === 'win') return { bg: '#00ff8815', color: '#00ff88', label: 'WIN' };
  if (o === 'loss') return { bg: '#ff3d5a15', color: '#ff3d5a', label: 'LOSS' };
  if (o === 'not_applicable') return { bg: '#7a8fa815', color: '#7a8fa8', label: 'N/A' };
  return { bg: '#ffd70015', color: '#ffd700', label: 'PENDING' };
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function exportCsv(events: AuditEvent[]) {
  const headers = [
    'event_at',
    'event_type',
    'ticker',
    'action_taken',
    'rationale',
    'source',
    'outcome',
    'dollar_amount',
    'pnl_dollar',
    'pnl_pct',
  ];
  const rows = events.map((e) =>
    headers
      .map((h) => {
        const val = e[h as keyof AuditEvent];
        const str = val === undefined || val === null ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dark-recon-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<AuditStats>({ total: 0, trades: 0, signals: 0, decisions: 0 });
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [days, setDays] = useState<DaysFilter>(30);
  const [tickerSearch, setTickerSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedFields, setExpandedFields] = useState<Record<string, 'action' | 'rationale'>>({});

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('days', String(days));
      params.set('limit', '200');
      if (tickerSearch.trim()) params.set('ticker', tickerSearch.trim().toUpperCase());

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      setEvents(data.events || []);
      setStats(data.stats || { total: 0, trades: 0, signals: 0, decisions: 0 });
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [days, tickerSearch]);

  useEffect(() => {
    void fetchAudit();
  }, [fetchAudit]);

  const filtered = events.filter((e) => {
    const allowed = CATEGORY_EVENTS[category];
    if (allowed && !allowed.includes(e.event_type)) return false;
    return true;
  });

  const toggleField = (id: string, field: 'action' | 'rationale') => {
    setExpandedFields((prev) => {
      const next = { ...prev };
      if (next[id] === field) {
        delete next[id];
      } else {
        next[id] = field;
      }
      return next;
    });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#00ff88',
            marginBottom: 6,
          }}
        >
          ◆ DARK RECON
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 24,
                fontWeight: 800,
                color: '#e8edf5',
                margin: 0,
              }}
            >
              Audit Log
            </h1>
            <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
              Complete record of every action — compliance, legal protection, strategy research
            </div>
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            style={{
              padding: '10px 20px',
              background: filtered.length === 0 ? '#1e2a3a' : '#3d9aff15',
              border: `1px solid ${filtered.length === 0 ? '#1e2a3a' : '#3d9aff40'}`,
              borderRadius: 8,
              color: filtered.length === 0 ? '#7a8fa8' : '#3d9aff',
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: 700,
              cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            ↓ EXPORT CSV
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        {(['ALL', 'TRADES', 'SIGNALS', 'AUTOPILOT', 'CONGRESSIONAL', 'SYSTEM'] as CategoryFilter[]).map(
          (c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: '6px 12px',
                background: category === c ? '#00ff8820' : '#0d1117',
                border: `1px solid ${category === c ? '#00ff8840' : '#1e2a3a'}`,
                borderRadius: 6,
                color: category === c ? '#00ff88' : '#7a8fa8',
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              {c}
            </button>
          )
        )}
        <span style={{ color: '#1e2a3a' }}>|</span>
        {([
          [1, 'TODAY'],
          [7, '7D'],
          [30, '30D'],
          [0, 'ALL'],
        ] as [DaysFilter, string][]).map(([d, label]) => (
          <button
            key={label}
            onClick={() => setDays(d)}
            style={{
              padding: '6px 12px',
              background: days === d ? '#ffd70020' : '#0d1117',
              border: `1px solid ${days === d ? '#ffd70040' : '#1e2a3a'}`,
              borderRadius: 6,
              color: days === d ? '#ffd700' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
        <input
          type="text"
          placeholder="Ticker..."
          value={tickerSearch}
          onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && void fetchAudit()}
          style={{
            padding: '6px 12px',
            background: '#0d1117',
            border: '1px solid #1e2a3a',
            borderRadius: 6,
            color: '#e8edf5',
            fontFamily: 'monospace',
            fontSize: 11,
            width: 90,
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'TOTAL EVENTS', value: stats.total, color: '#e8edf5' },
          { label: 'TRADES LOGGED', value: stats.trades, color: '#00ff88' },
          { label: 'SIGNALS TRACKED', value: stats.signals, color: '#3d9aff' },
          { label: 'DECISIONS MADE', value: stats.decisions, color: '#ffd700' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderRadius: 10,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 2,
                color: '#3d5068',
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              color: '#3d5068',
            }}
          >
            LOADING AUDIT LOG...
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#3d5068',
              lineHeight: 1.6,
            }}
          >
            No audit events yet — actions taken in Dark Recon will be recorded here automatically
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '130px 90px 60px 1fr 1fr 70px 70px',
                gap: 8,
                padding: '10px 14px',
                borderBottom: '1px solid #1e2a3a',
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 1,
                color: '#3d5068',
              }}
            >
              <span>TIME</span>
              <span>TYPE</span>
              <span>TICKER</span>
              <span>ACTION</span>
              <span>RATIONALE</span>
              <span>SOURCE</span>
              <span>OUTCOME</span>
            </div>
            {filtered.map((event) => {
              const typeStyle = eventTypeColor(event.event_type);
              const outStyle = outcomeStyle(event.outcome);
              const isExpanded = expandedId === event.id;
              const actionExpanded = expandedFields[event.id] === 'action';
              const rationaleExpanded = expandedFields[event.id] === 'rationale';

              return (
                <div key={event.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '130px 90px 60px 1fr 1fr 70px 70px',
                      gap: 8,
                      padding: '10px 14px',
                      borderBottom: '1px solid #1e2a3a10',
                      cursor: 'pointer',
                      alignItems: 'start',
                      background: isExpanded ? '#0d1117' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color: '#7a8fa8',
                        lineHeight: 1.4,
                      }}
                    >
                      {new Date(event.event_at).toLocaleDateString()}
                      <br />
                      {new Date(event.event_at).toLocaleTimeString()}
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 7,
                        letterSpacing: 1,
                        padding: '2px 6px',
                        borderRadius: 10,
                        background: typeStyle.bg,
                        border: `1px solid ${typeStyle.border}`,
                        color: typeStyle.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {typeStyle.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 10,
                        color: event.ticker ? '#ffd700' : '#3d5068',
                        fontWeight: 700,
                      }}
                    >
                      {event.ticker || '—'}
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleField(event.id, 'action');
                      }}
                      style={{ fontSize: 11, color: '#e8edf5', lineHeight: 1.4, cursor: 'pointer' }}
                      title="Click to expand"
                    >
                      {actionExpanded ? event.action_taken : truncate(event.action_taken, 60)}
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleField(event.id, 'rationale');
                      }}
                      style={{ fontSize: 11, color: '#7a8fa8', lineHeight: 1.4, cursor: 'pointer' }}
                      title="Click to expand"
                    >
                      {event.rationale
                        ? rationaleExpanded
                          ? event.rationale
                          : truncate(event.rationale, 80)
                        : '—'}
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 7,
                        letterSpacing: 1,
                        color: '#7a8fa8',
                      }}
                    >
                      {event.source.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 7,
                        letterSpacing: 1,
                        padding: '2px 6px',
                        borderRadius: 10,
                        background: outStyle.bg,
                        color: outStyle.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {outStyle.label}
                    </span>
                  </div>
                  {isExpanded && (
                    <div
                      style={{
                        padding: '12px 14px 14px',
                        background: '#0d1117',
                        borderBottom: '1px solid #1e2a3a',
                        fontFamily: 'monospace',
                        fontSize: 10,
                        color: '#7a8fa8',
                        lineHeight: 1.6,
                      }}
                    >
                      <div style={{ color: '#3d5068', marginBottom: 6, letterSpacing: 1 }}>
                        FULL EVENT DETAILS
                      </div>
                      <div>
                        <strong style={{ color: '#e8edf5' }}>Type:</strong> {event.event_type}
                      </div>
                      {event.conviction_score && (
                        <div>
                          <strong style={{ color: '#e8edf5' }}>Conviction:</strong>{' '}
                          {event.conviction_score}/10
                        </div>
                      )}
                      {event.dollar_amount && (
                        <div>
                          <strong style={{ color: '#e8edf5' }}>Amount:</strong> $
                          {event.dollar_amount.toLocaleString()}
                        </div>
                      )}
                      {event.pnl_dollar !== undefined && event.pnl_dollar !== null && (
                        <div>
                          <strong style={{ color: '#e8edf5' }}>P&L:</strong> $
                          {event.pnl_dollar.toFixed(0)} ({event.pnl_pct?.toFixed(2)}%)
                        </div>
                      )}
                      {event.signal_sources && event.signal_sources.length > 0 && (
                        <div>
                          <strong style={{ color: '#e8edf5' }}>Signals:</strong>{' '}
                          {event.signal_sources.join(', ')}
                        </div>
                      )}
                      {event.raw_data && (
                        <pre
                          style={{
                            marginTop: 10,
                            padding: 10,
                            background: '#111620',
                            border: '1px solid #1e2a3a',
                            borderRadius: 6,
                            overflow: 'auto',
                            fontSize: 9,
                            color: '#3d5068',
                          }}
                        >
                          {JSON.stringify(event.raw_data, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
