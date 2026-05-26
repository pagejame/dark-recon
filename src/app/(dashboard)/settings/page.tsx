'use client';

import { useState, useEffect, useCallback, type ReactNode, type CSSProperties } from 'react';

interface RiskSettings {
  max_position_pct: number;
  max_options_pct: number;
  weekly_contribution: number;
}

interface ScannerSettings {
  auto_scan: boolean;
  scan_interval_minutes: number;
  min_strength: 'low' | 'medium' | 'high';
}

interface BriefingSettings {
  enabled: boolean;
  include_levels: boolean;
  include_signals: boolean;
}

interface NotificationSettings {
  high_conviction: boolean;
  scan_complete: boolean;
  briefing_ready: boolean;
}

interface EmailSettings {
  weekly_enabled: boolean;
  email_address: string;
}

interface ToggleSetting {
  enabled: boolean;
}

interface AgentDecisionResult {
  action: string;
  issue: string;
  rationale: string;
  ticker?: string;
}

interface AgentRunResult {
  executed: number;
  queued: number;
  notified: number;
  decisions: AgentDecisionResult[];
  error?: string;
}

interface AutonomyConfig {
  enabled: boolean;
  started_at: string | null;
  ends_at: string | null;
  days_remaining: number | null;
  min_conviction: number;
  max_position_pct: number;
  daily_trade_limit: number;
}

const DEFAULT_AUTO_CLOSE: ToggleSetting = { enabled: true };
const DEFAULT_WATCHLIST_AUTOPOP: ToggleSetting = { enabled: true };
const DEFAULT_AUTONOMOUS_AGENT: ToggleSetting = { enabled: true };

const DEFAULT_RISK: RiskSettings = {
  max_position_pct: 5,
  max_options_pct: 15,
  weekly_contribution: 500,
};

const DEFAULT_SCANNER: ScannerSettings = {
  auto_scan: true,
  scan_interval_minutes: 5,
  min_strength: 'low',
};

const DEFAULT_BRIEFING: BriefingSettings = {
  enabled: true,
  include_levels: true,
  include_signals: true,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  high_conviction: true,
  scan_complete: false,
  briefing_ready: true,
};

const DEFAULT_EMAIL: EmailSettings = {
  weekly_enabled: true,
  email_address: '',
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        cursor: 'pointer',
        background: value ? '#00ff88' : '#1e2a3a',
        border: `1px solid ${value ? '#00ff88' : '#2a3a50'}`,
        position: 'relative',
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: value ? '#080a0f' : '#7a8fa8',
          position: 'absolute',
          top: 2,
          left: value ? 22 : 2,
          transition: 'left 0.2s',
        }}
      />
    </div>
  );
}

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
          marginBottom: 20,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid #1e2a3a40',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 1,
            color: '#e8edf5',
            marginBottom: description ? 4 : 0,
          }}
        >
          {label}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.5 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  maxWidth: 120,
  padding: '10px 14px',
  background: '#0d1117',
  border: '1px solid #1e2a3a',
  borderRadius: 8,
  color: '#e8edf5',
  fontFamily: 'monospace',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  maxWidth: 160,
  cursor: 'pointer',
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState<RiskSettings>(DEFAULT_RISK);
  const [scanner, setScanner] = useState<ScannerSettings>(DEFAULT_SCANNER);
  const [briefing, setBriefing] = useState<BriefingSettings>(DEFAULT_BRIEFING);
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [email, setEmail] = useState<EmailSettings>(DEFAULT_EMAIL);
  const [autoClose, setAutoClose] = useState<ToggleSetting>(DEFAULT_AUTO_CLOSE);
  const [watchlistAutopop, setWatchlistAutopop] = useState<ToggleSetting>(DEFAULT_WATCHLIST_AUTOPOP);
  const [autonomousAgent, setAutonomousAgent] = useState<ToggleSetting>(DEFAULT_AUTONOMOUS_AGENT);

  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);
  const [auditReportLoading, setAuditReportLoading] = useState(false);
  const [auditReportResult, setAuditReportResult] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<AgentRunResult | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [autonomyConfig, setAutonomyConfig] = useState<AutonomyConfig | null>(null);
  const [tradingMode, setTradingMode] = useState<'day_trading' | 'swing_trading'>('swing_trading');
  const [modeSwitching, setModeSwitching] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.risk) setRisk({ ...DEFAULT_RISK, ...data.risk });
      if (data.scanner) setScanner({ ...DEFAULT_SCANNER, ...data.scanner });
      if (data.briefing) setBriefing({ ...DEFAULT_BRIEFING, ...data.briefing });
      if (data.notifications) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...data.notifications });
      if (data.email) setEmail({ ...DEFAULT_EMAIL, ...data.email });
      if (data.auto_close_enabled) setAutoClose({ ...DEFAULT_AUTO_CLOSE, ...data.auto_close_enabled });
      if (data.watchlist_autopop_enabled) {
        setWatchlistAutopop({ ...DEFAULT_WATCHLIST_AUTOPOP, ...data.watchlist_autopop_enabled });
      }
      if (data.autonomous_agent_enabled) {
        setAutonomousAgent({ ...DEFAULT_AUTONOMOUS_AGENT, ...data.autonomous_agent_enabled });
      }
    } catch {
      // defaults remain
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
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
  }, [fetchSettings]);

  const switchMode = async (newMode: 'day_trading' | 'swing_trading') => {
    setModeSwitching(true);
    try {
      const res = await fetch('/api/trading-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (data.success) {
        setTradingMode(newMode);
      }
    } finally {
      setModeSwitching(false);
    }
  };

  const saveRiskSettings = async () => {
    setSaving('risk');
    setSaveError(null);
    try {
      const saves = [
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'risk', value: risk }),
        }),
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'auto_close_enabled', value: autoClose }),
        }),
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'watchlist_autopop_enabled', value: watchlistAutopop }),
        }),
      ];
      const results = await Promise.all(saves);
      for (const res of results) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
      }
      setSavedSection('risk');
      setTimeout(() => setSavedSection(null), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const saveSection = async (key: string, value: unknown) => {
    setSaving(key);
    setSaveError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedSection(key);
      setTimeout(() => setSavedSection(null), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const sendTestEmail = async () => {
    setTestEmailLoading(true);
    setTestEmailResult(null);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.email_address || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Test email failed');
      setTestEmailResult(data.message);
    } catch (e) {
      setTestEmailResult(e instanceof Error ? e.message : 'Test email failed');
    } finally {
      setTestEmailLoading(false);
    }
  };

  const saveAutonomousAgent = async (value: ToggleSetting) => {
    setAutonomousAgent(value);
    setSaving('autonomous_agent');
    setSaveError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'autonomous_agent_enabled', value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedSection('autonomous_agent');
      setTimeout(() => setSavedSection(null), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const runAgent = async () => {
    setAgentRunning(true);
    setAgentResult(null);
    try {
      const res = await fetch('/api/agent/runs', { method: 'POST' });
      const data = await res.json();
      setAgentResult(data);
    } catch {
      setAgentResult({
        error: 'Failed to run agent',
        executed: 0,
        queued: 0,
        notified: 0,
        decisions: [],
      });
    } finally {
      setAgentRunning(false);
    }
  };

  const maxSingleTrade = (risk.weekly_contribution * risk.max_position_pct) / 100;
  const autonomyEnabled = autonomyConfig?.enabled === true;
  const daysRemaining = autonomyConfig?.days_remaining ?? null;

  const SaveButton = ({ sectionKey }: { sectionKey: string }) => (
    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={() => {
          if (sectionKey === 'risk') void saveRiskSettings();
          else if (sectionKey === 'scanner') saveSection('scanner', scanner);
          else if (sectionKey === 'briefing') saveSection('briefing', briefing);
          else if (sectionKey === 'notifications') saveSection('notifications', notifications);
          else if (sectionKey === 'email') saveSection('email', email);
        }}
        disabled={saving === sectionKey}
        style={{
          padding: '10px 20px',
          background: saving === sectionKey ? '#1e2a3a' : '#00ff88',
          color: saving === sectionKey ? '#7a8fa8' : '#080a0f',
          border: 'none',
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: 2,
          fontWeight: 700,
          cursor: saving === sectionKey ? 'not-allowed' : 'pointer',
        }}
      >
        {saving === sectionKey ? 'SAVING...' : 'SAVE'}
      </button>
      {savedSection === sectionKey && (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#00ff88', letterSpacing: 1 }}>
          Saved
        </span>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1000px] px-3.5 py-6 md:p-6">
      <div style={{ marginBottom: 28 }}>
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
        <h1
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 24,
            fontWeight: 800,
            color: '#e8edf5',
            margin: 0,
          }}
        >
          Settings
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Configure risk, agents, and notifications
        </div>
      </div>

      {saveError && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: '#ff3d5a10',
            border: '1px solid #ff3d5a40',
            borderRadius: 8,
            color: '#ff8fa0',
            fontSize: 13,
          }}
        >
          {saveError}
        </div>
      )}

      <div
        style={{
          background: autonomyEnabled ? '#00ff8808' : '#111620',
          border: `2px solid ${autonomyEnabled ? '#00ff8840' : '#1e2a3a'}`,
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {autonomyEnabled && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#00ff88',
                    boxShadow: '0 0 8px #00ff88',
                  }}
                />
              )}
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: autonomyEnabled ? '#00ff88' : '#7a8fa8',
                }}
              >
                FULL AUTONOMY MODE
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8edf5', marginBottom: 6 }}>
              {autonomyEnabled ? 'Dark Recon is trading itself' : 'Enable full autonomous trading'}
            </div>
            <div style={{ fontSize: 13, color: '#7a8fa8', lineHeight: 1.7, marginBottom: 12 }}>
              {autonomyEnabled
                ? `All decisions automated — trades execute, stops fire, rebalancing trims. Agent runs every 10 minutes.${daysRemaining != null ? ` ${daysRemaining} days remaining in trial period.` : ''}`
                : '30-day paper trading trial. All decisions automated — no approval gates. Trades execute based on conviction score ≥ 8, position size ≤ 5%, max 3 trades per day. Full audit trail maintained.'}
            </div>
            {autonomyEnabled && autonomyConfig?.started_at && (
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  color: '#3d5068',
                  letterSpacing: 1,
                }}
              >
                Started: {new Date(autonomyConfig.started_at).toLocaleDateString()} · Ends:{' '}
                {autonomyConfig.ends_at
                  ? new Date(autonomyConfig.ends_at).toLocaleDateString()
                  : 'N/A'}
              </div>
            )}
          </div>

          {autonomyEnabled && daysRemaining !== null && (
            <div
              style={{
                textAlign: 'center',
                background: '#00ff8815',
                border: '1px solid #00ff8840',
                borderRadius: 10,
                padding: '16px 24px',
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 36,
                  fontWeight: 700,
                  color: '#00ff88',
                }}
              >
                {daysRemaining}
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
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!autonomyEnabled ? (
            <button
              type="button"
              onClick={async () => {
                const res = await fetch('/api/autonomy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'enable', days: 30 }),
                });
                const data = await res.json();
                if (data.success) window.location.reload();
              }}
              style={{
                padding: '10px 24px',
                background: '#00ff88',
                color: '#080a0f',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚡ ENABLE 30-DAY TRIAL
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                if (
                  window.confirm(
                    'Disable full autonomy? Dark Recon will stop trading automatically and require your approval for all trades.'
                  )
                ) {
                  await fetch('/api/autonomy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'disable' }),
                  });
                  window.location.reload();
                }
              }}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                border: '1px solid #ff3d5a40',
                borderRadius: 8,
                color: '#ff3d5a',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                cursor: 'pointer',
              }}
            >
              DISABLE AUTONOMY
            </button>
          )}
          <a
            href="/agent"
            style={{
              padding: '10px 20px',
              background: '#1e2a3a',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              color: '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            VIEW AGENT LOG →
          </a>
        </div>
      </div>

      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 3,
                color: tradingMode === 'day_trading' ? '#ffd700' : '#00ff88',
                marginBottom: 6,
              }}
            >
              ◆ TRADING MODE
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#e8edf5', margin: 0 }}>
              {tradingMode === 'day_trading' ? 'Day Trading' : 'Swing / Investing'}
            </h2>
            <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
              {tradingMode === 'day_trading'
                ? 'High frequency intraday — requires $25k+ account (PDT rule)'
                : 'Multi-day positions — works with any account size'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => void switchMode('swing_trading')}
            disabled={modeSwitching || tradingMode === 'swing_trading'}
            style={{
              padding: '16px 20px',
              background: tradingMode === 'swing_trading' ? '#00ff8815' : '#0d1117',
              border: `2px solid ${tradingMode === 'swing_trading' ? '#00ff88' : '#1e2a3a'}`,
              borderRadius: 10,
              cursor: tradingMode === 'swing_trading' ? 'default' : 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {tradingMode === 'swing_trading' && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#00ff88',
                    display: 'inline-block',
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  color: tradingMode === 'swing_trading' ? '#00ff88' : '#7a8fa8',
                  letterSpacing: 1,
                }}
              >
                SWING / INVESTING
              </span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', lineHeight: 1.8 }}>
              10 trades/day · 8% position · Any account size
              <br />
              +10/20/30% targets · -7% stop · Holds overnight
            </div>
          </button>

          <button
            type="button"
            onClick={() => void switchMode('day_trading')}
            disabled={modeSwitching || tradingMode === 'day_trading'}
            style={{
              padding: '16px 20px',
              background: tradingMode === 'day_trading' ? '#ffd70015' : '#0d1117',
              border: `2px solid ${tradingMode === 'day_trading' ? '#ffd700' : '#1e2a3a'}`,
              borderRadius: 10,
              cursor: tradingMode === 'day_trading' ? 'default' : 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {tradingMode === 'day_trading' && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#ffd700',
                    display: 'inline-block',
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  color: tradingMode === 'day_trading' ? '#ffd700' : '#7a8fa8',
                  letterSpacing: 1,
                }}
              >
                DAY TRADING
              </span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068', lineHeight: 1.8 }}>
              100 trades/day · 3% position · Requires $25k+
              <br />
              +2/5/10% targets · -1.5% stop · Flat every night
            </div>
          </button>
        </div>

        <div style={{ background: '#0d1117', borderRadius: 8, padding: 16 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 3,
              color: '#3d5068',
              marginBottom: 12,
            }}
          >
            ACTIVE CONFIGURATION
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {[
              { label: 'TRADES/DAY', value: tradingMode === 'day_trading' ? '100' : '10' },
              { label: 'POSITION SIZE', value: tradingMode === 'day_trading' ? '3%' : '8%' },
              { label: 'STOP LOSS', value: tradingMode === 'day_trading' ? '-1.5%' : '-7%' },
              { label: 'TARGET 1', value: tradingMode === 'day_trading' ? '+2%' : '+10%' },
              { label: 'TARGET 2', value: tradingMode === 'day_trading' ? '+5%' : '+20%' },
              { label: 'TARGET 3', value: tradingMode === 'day_trading' ? '+10%' : '+30%' },
              { label: 'OVERNIGHT', value: tradingMode === 'day_trading' ? 'NEVER' : 'YES' },
              { label: 'SHORTS', value: tradingMode === 'day_trading' ? 'ENABLED' : 'DISABLED' },
            ].map((item) => (
              <div key={item.label} style={{ padding: '8px 0', borderBottom: '1px solid #1e2a3a' }}>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 7,
                    color: '#3d5068',
                    letterSpacing: 2,
                    marginBottom: 3,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#e8edf5',
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 2,
                  color: '#3d5068',
                  marginBottom: 3,
                }}
              >
                AGENT CYCLE
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#ffd700' }}>
                Every 30 min — Testing Mode
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  color: '#3d5068',
                  marginTop: 2,
                }}
              >
                Switch to every 60s for live production trading
              </div>
            </div>
            <div
              style={{
                padding: '4px 10px',
                background: '#ffd70015',
                border: '1px solid #ffd70030',
                borderRadius: 20,
                fontFamily: 'monospace',
                fontSize: 8,
                color: '#ffd700',
                letterSpacing: 2,
              }}
            >
              TESTING
            </div>
          </div>
        </div>

        {tradingMode === 'day_trading' && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: '#ffd70010',
              border: '1px solid #ffd70030',
              borderRadius: 8,
            }}
          >
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#ffd700' }}>
              ⚠️ PDT RULE: Day trading requires $25,000 minimum account balance. Under $25k you are
              limited to 3 round-trip trades per 5 business days on a margin account. Switch to
              Swing / Investing mode to trade with any account size.
            </div>
          </div>
        )}

        {modeSwitching && (
          <div
            style={{
              marginTop: 12,
              fontFamily: 'monospace',
              fontSize: 10,
              color: '#7a8fa8',
              textAlign: 'center',
            }}
          >
            Switching mode — updating all parameters...
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={i === 5 ? 'md:col-span-2' : undefined}
              style={{
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderRadius: 10,
                padding: 24,
              }}
            >
              <Skeleton height={12} />
              <div style={{ marginTop: 16 }}>
                <Skeleton height={40} />
              </div>
              <div style={{ marginTop: 12 }}>
                <Skeleton height={40} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {/* Risk Management */}
          <SectionCard label="RISK MANAGEMENT" borderColor="#ff3d5a">
            <SettingRow label="Weekly Contribution" description="Amount deposited each week ($)">
              <input
                type="number"
                min={0}
                step={50}
                value={risk.weekly_contribution}
                onChange={(e) =>
                  setRisk({ ...risk, weekly_contribution: parseFloat(e.target.value) || 0 })
                }
                style={inputStyle}
              />
            </SettingRow>
            <SettingRow label="Max Position Size" description="Maximum % of weekly budget per trade">
              <input
                type="number"
                min={1}
                max={10}
                value={risk.max_position_pct}
                onChange={(e) =>
                  setRisk({
                    ...risk,
                    max_position_pct: Math.min(10, Math.max(1, parseFloat(e.target.value) || 1)),
                  })
                }
                style={inputStyle}
              />
            </SettingRow>
            <SettingRow label="Max Options Exposure" description="Maximum % allocated to options">
              <input
                type="number"
                min={1}
                max={25}
                value={risk.max_options_pct}
                onChange={(e) =>
                  setRisk({
                    ...risk,
                    max_options_pct: Math.min(25, Math.max(1, parseFloat(e.target.value) || 1)),
                  })
                }
                style={inputStyle}
              />
            </SettingRow>
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: '#0d1117',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#7a8fa8',
              }}
            >
              At ${risk.weekly_contribution.toLocaleString()} weekly, max single trade ={' '}
              <span style={{ color: '#00ff88', fontWeight: 700 }}>
                ${maxSingleTrade.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ borderTop: '1px solid #1e2a3a40', marginTop: 16, paddingTop: 8 }}>
              <SettingRow
                label="Auto-Close on Stop Breach"
                description="Automatically close positions when stop loss is breached during market hours. ON by default for paper trading — switch OFF to require manual approval instead."
              >
                <Toggle
                  value={autoClose.enabled}
                  onChange={(v) => setAutoClose({ enabled: v })}
                />
              </SettingRow>
              <SettingRow
                label="Watchlist Auto-Population"
                description="Automatically add tickers to watchlist when they appear in 2+ signal sources in the same week."
              >
                <Toggle
                  value={watchlistAutopop.enabled}
                  onChange={(v) => setWatchlistAutopop({ enabled: v })}
                />
              </SettingRow>
            </div>

            <SaveButton sectionKey="risk" />
          </SectionCard>

          {/* Scanner */}
          <SectionCard label="SCANNER CONFIGURATION" borderColor="#3d9aff">
            <SettingRow label="Auto Scan" description="Run market scanner automatically">
              <Toggle
                value={scanner.auto_scan}
                onChange={(v) => setScanner({ ...scanner, auto_scan: v })}
              />
            </SettingRow>
            <SettingRow label="Scan Interval" description="How often to scan markets">
              <select
                value={scanner.scan_interval_minutes}
                onChange={(e) =>
                  setScanner({ ...scanner, scan_interval_minutes: parseInt(e.target.value, 10) })
                }
                style={selectStyle}
              >
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
              </select>
            </SettingRow>
            <SettingRow label="Minimum Signal Strength" description="Filter out weaker signals">
              <select
                value={scanner.min_strength}
                onChange={(e) =>
                  setScanner({
                    ...scanner,
                    min_strength: e.target.value as ScannerSettings['min_strength'],
                  })
                }
                style={selectStyle}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </SettingRow>
            <SaveButton sectionKey="scanner" />
          </SectionCard>

          {/* Briefing */}
          <SectionCard label="MORNING BRIEFING" borderColor="#00ff88">
            <SettingRow label="Briefing Enabled" description="Generate daily morning briefing">
              <Toggle
                value={briefing.enabled}
                onChange={(v) => setBriefing({ ...briefing, enabled: v })}
              />
            </SettingRow>
            <SettingRow label="Include Key Levels" description="SPY/QQQ support and resistance">
              <Toggle
                value={briefing.include_levels}
                onChange={(v) => setBriefing({ ...briefing, include_levels: v })}
              />
            </SettingRow>
            <SettingRow label="Include Top Signals" description="Highlight top scanner signals">
              <Toggle
                value={briefing.include_signals}
                onChange={(v) => setBriefing({ ...briefing, include_signals: v })}
              />
            </SettingRow>
            <SaveButton sectionKey="briefing" />
          </SectionCard>

          {/* Notifications */}
          <SectionCard label="NOTIFICATIONS" borderColor="#ffd700">
            <SettingRow label="High Conviction Alerts" description="Notify on high-strength signals">
              <Toggle
                value={notifications.high_conviction}
                onChange={(v) => setNotifications({ ...notifications, high_conviction: v })}
              />
            </SettingRow>
            <SettingRow label="Scan Complete" description="Notify when a scan finishes">
              <Toggle
                value={notifications.scan_complete}
                onChange={(v) => setNotifications({ ...notifications, scan_complete: v })}
              />
            </SettingRow>
            <SettingRow label="Briefing Ready" description="Notify when morning briefing is ready">
              <Toggle
                value={notifications.briefing_ready}
                onChange={(v) => setNotifications({ ...notifications, briefing_ready: v })}
              />
            </SettingRow>
            <SaveButton sectionKey="notifications" />
          </SectionCard>

          {/* Email Notifications */}
          <SectionCard label="EMAIL NOTIFICATIONS" borderColor="#3d9aff" className="md:col-span-2">
            <p style={{ fontSize: 13, color: '#7a8fa8', margin: '0 0 16px', lineHeight: 1.6 }}>
              Weekly performance summary sent every Sunday morning. Full audit report with Claude
              analysis every Sunday at 6PM ET.
            </p>
            <SettingRow label="Email Address" description="Where weekly reports are delivered">
              <input
                type="email"
                value={email.email_address}
                onChange={(e) => setEmail({ ...email, email_address: e.target.value })}
                placeholder="you@example.com"
                style={{ ...inputStyle, maxWidth: 240 }}
              />
            </SettingRow>
            <SettingRow
              label="Weekly Performance Email"
              description="Automated Sunday morning week-in-review"
            >
              <Toggle
                value={email.weekly_enabled}
                onChange={(v) => setEmail({ ...email, weekly_enabled: v })}
              />
            </SettingRow>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void sendTestEmail()}
                disabled={testEmailLoading}
                style={{
                  padding: '10px 20px',
                  background: testEmailLoading ? '#1e2a3a' : '#3d9aff15',
                  color: testEmailLoading ? '#7a8fa8' : '#3d9aff',
                  border: '1px solid #3d9aff40',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: 700,
                  cursor: testEmailLoading ? 'wait' : 'pointer',
                }}
              >
                {testEmailLoading ? 'SENDING…' : 'SEND TEST EMAIL'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch('/api/email/eod', { method: 'POST' });
                  const data = await res.json();
                  alert(data.message || 'EOD email sent');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#3d9aff15',
                  border: '1px solid #3d9aff40',
                  borderRadius: 8,
                  color: '#3d9aff',
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: 'pointer',
                }}
              >
                SEND EOD SUMMARY
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAuditReportLoading(true);
                  setAuditReportResult(null);
                  try {
                    const res = await fetch('/api/reports', { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                      throw new Error(data.error || 'Report generation failed');
                    }
                    setAuditReportResult(
                      `Report generated · P&L ${data.report?.performance?.week_pnl >= 0 ? '+' : ''}$${data.report?.performance?.week_pnl?.toFixed(2) ?? '0.00'} · emailed`
                    );
                  } catch (e) {
                    setAuditReportResult(
                      e instanceof Error ? e.message : 'Report generation failed'
                    );
                  } finally {
                    setAuditReportLoading(false);
                  }
                }}
                disabled={auditReportLoading}
                style={{
                  padding: '10px 20px',
                  background: auditReportLoading ? '#1e2a3a' : '#9b5de515',
                  border: '1px solid #9b5de540',
                  borderRadius: 8,
                  color: auditReportLoading ? '#7a8fa8' : '#9b5de5',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: 700,
                  cursor: auditReportLoading ? 'wait' : 'pointer',
                }}
              >
                {auditReportLoading ? 'GENERATING…' : 'GENERATE REPORT NOW'}
              </button>
              {testEmailResult && (
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: testEmailResult.includes('sent') ? '#00ff88' : '#ff8fa0',
                  }}
                >
                  {testEmailResult}
                </span>
              )}
              {auditReportResult && (
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: auditReportResult.includes('generated') ? '#00ff88' : '#ff8fa0',
                  }}
                >
                  {auditReportResult}
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: 16,
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#3d5068',
                lineHeight: 1.6,
              }}
            >
              Emails sent from autopilot@dark-recon.com via Resend. Verify dark-recon.com in Resend
              and add DNS records in Vercel.
            </div>
            <SaveButton sectionKey="email" />
          </SectionCard>

          {/* Autonomous Agent */}
          <div
            style={{
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderLeft: '3px solid #00ff88',
              borderRadius: 10,
              padding: 20,
              marginBottom: 12,
            }}
            className="md:col-span-2"
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 3,
                color: '#00ff88',
                marginBottom: 16,
              }}
            >
              AUTONOMOUS AGENT
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 16,
              }}
            >
              <div style={{ flex: 1, marginRight: 20 }}>
                <div style={{ fontSize: 14, color: '#e8edf5', marginBottom: 6 }}>
                  Enable Autonomous Agent
                </div>
                <div style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.6 }}>
                  Runs every 10 minutes during market hours. Scans the platform, reviews findings
                  with Claude, and executes safe actions automatically. Trade entries always require
                  your approval. Destructive actions (close positions) require confirmation.
                </div>
              </div>
              <Toggle
                value={autonomousAgent.enabled}
                onChange={(v) => void saveAutonomousAgent({ enabled: v })}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void runAgent()}
                disabled={agentRunning}
                style={{
                  padding: '8px 16px',
                  background: agentRunning ? '#1e2a3a' : '#00ff8815',
                  border: '1px solid #00ff8840',
                  borderRadius: 8,
                  color: agentRunning ? '#7a8fa8' : '#00ff88',
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: agentRunning ? 'not-allowed' : 'pointer',
                }}
              >
                {agentRunning ? 'RUNNING...' : 'RUN AGENT NOW'}
              </button>
              {savedSection === 'autonomous_agent' && (
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#00ff88',
                    letterSpacing: 1,
                  }}
                >
                  Saved
                </span>
              )}
            </div>

            {agentResult && !agentResult.error && (
              <div
                style={{
                  marginTop: 12,
                  padding: 14,
                  background: '#00ff8808',
                  border: '1px solid #00ff8830',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 2,
                    color: '#00ff88',
                    marginBottom: 8,
                  }}
                >
                  AGENT RUN COMPLETE
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#7a8fa8',
                    marginBottom: 8,
                  }}
                >
                  ⚡ {agentResult.executed} executed · 📋 {agentResult.queued} queued · 🔔{' '}
                  {agentResult.notified} flagged
                </div>
                {(agentResult.decisions || [])
                  .filter((d) => d.action !== 'SKIP')
                  .map((d, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        color: '#7a8fa8',
                        padding: '4px 0',
                        borderTop: '1px solid #1e2a3a',
                        marginTop: 4,
                      }}
                    >
                      <span
                        style={{
                          color:
                            d.action === 'AUTO_EXECUTE'
                              ? '#00ff88'
                              : d.action === 'QUEUE_FOR_APPROVAL'
                                ? '#3d9aff'
                                : '#ffd700',
                          marginRight: 8,
                        }}
                      >
                        {d.action === 'AUTO_EXECUTE'
                          ? '⚡'
                          : d.action === 'QUEUE_FOR_APPROVAL'
                            ? '📋'
                            : '🔔'}
                      </span>
                      <span style={{ color: '#e8edf5' }}>{d.issue}</span>
                      <div
                        style={{
                          paddingLeft: 20,
                          color: '#7a8fa8',
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {d.rationale}
                      </div>
                    </div>
                  ))}
                <a
                  href="/agent"
                  style={{
                    display: 'block',
                    marginTop: 10,
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: '#3d9aff',
                    letterSpacing: 1,
                    textDecoration: 'none',
                  }}
                >
                  VIEW FULL AGENT LOG →
                </a>
              </div>
            )}
            {agentResult?.error && (
              <div style={{ marginTop: 12, fontFamily: 'monospace', fontSize: 11, color: '#ff8fa0' }}>
                {agentResult.error}
              </div>
            )}
          </div>

          {/* Account */}
          <SectionCard label="ACCOUNT" borderColor="#7a8fa8" className="md:col-span-2">
            <SettingRow label="Paper Trading">
              <span
                style={{
                  background: '#00ff8815',
                  color: '#00ff88',
                  border: '1px solid #00ff8840',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 2,
                  fontWeight: 700,
                }}
              >
                ACTIVE
              </span>
            </SettingRow>
            <SettingRow label="Alpaca Account ID">
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#00ff88', fontWeight: 700 }}>
                Connected
              </span>
            </SettingRow>
            <SettingRow label="Weekly Deposit">
              <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#e8edf5', fontWeight: 700 }}>
                ${risk.weekly_contribution.toLocaleString()}
              </span>
            </SettingRow>
            <div style={{ paddingTop: 14 }}>
              <a
                href="https://app.alpaca.markets/paper/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  background: '#0d1117',
                  border: '1px solid #1e2a3a',
                  borderRadius: 8,
                  color: '#7a8fa8',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 2,
                  textDecoration: 'none',
                }}
              >
                RESET PAPER ACCOUNT →
              </a>
            </div>
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid #1e2a3a40',
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#3d5068',
                letterSpacing: 1,
              }}
            >
              Dark Recon Version: 1.0.0 — Built by Dark Recon AI
            </div>
          </SectionCard>
        </div>
      )}

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
