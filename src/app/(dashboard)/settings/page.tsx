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
}: {
  label: string;
  borderColor: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10,
        padding: '20px 24px',
        marginBottom: 20,
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

  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.risk) setRisk({ ...DEFAULT_RISK, ...data.risk });
      if (data.scanner) setScanner({ ...DEFAULT_SCANNER, ...data.scanner });
      if (data.briefing) setBriefing({ ...DEFAULT_BRIEFING, ...data.briefing });
      if (data.notifications) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...data.notifications });
    } catch {
      // defaults remain
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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

  const maxSingleTrade = (risk.weekly_contribution * risk.max_position_pct) / 100;

  const SaveButton = ({ sectionKey }: { sectionKey: string }) => (
    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={() => {
          if (sectionKey === 'risk') saveSection('risk', risk);
          else if (sectionKey === 'scanner') saveSection('scanner', scanner);
          else if (sectionKey === 'briefing') saveSection('briefing', briefing);
          else if (sectionKey === 'notifications') saveSection('notifications', notifications);
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
    <div className="mx-auto max-w-[640px] px-3.5 py-6 md:p-6">
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

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
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
        <>
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

          {/* Account */}
          <SectionCard label="ACCOUNT" borderColor="#7a8fa8">
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
        </>
      )}

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
