'use client';

import type { Agent } from '@/types';

export interface AgentCardData extends Agent {
  description: string;
  metric: string;
}

interface AgentStatusGridProps {
  agents: AgentCardData[];
  loading?: boolean;
}

const STATUS_STYLES = {
  active: { color: '#00ff88', label: 'ACTIVE', pulse: true },
  standby: { color: '#7a8fa8', label: 'STANDBY', pulse: false },
  error: { color: '#ff3d5a', label: 'ERROR', pulse: false },
};

export default function AgentStatusGrid({ agents, loading }: AgentStatusGridProps) {
  return (
    <div
      style={{
        background: '#111620',
        border: '1px solid #1e2a3a',
        borderRadius: 10,
        padding: '16px 20px',
        height: '100%',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 3,
          color: '#7a8fa8',
          marginBottom: 14,
        }}
      >
        AGENT STATUS
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-elevated" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {agents.map((agent) => {
            const st = STATUS_STYLES[agent.status];
            return (
              <div
                key={agent.id}
                style={{
                  background: '#0d1117',
                  border: '1px solid #1e2a3a',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5' }}>
                    {agent.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: st.color,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {st.pulse && (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: st.color,
                          animation: 'pulse 2s infinite',
                        }}
                      />
                    )}
                    {st.label}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#3d5068', marginBottom: 6, lineHeight: 1.4 }}>
                  {agent.description}
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#7a8fa8' }}>
                    {agent.metric}
                  </span>
                  {agent.last_run && (
                    <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#3d5068' }}>
                      {new Date(agent.last_run).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
