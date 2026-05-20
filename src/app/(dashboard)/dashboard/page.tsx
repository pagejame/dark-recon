import MorningBriefing from '@/components/dashboard/MorningBriefing';
import SignalCard from '@/components/dashboard/SignalCard';
import AgentStatus from '@/components/dashboard/AgentStatus';
import Card from '@/components/ui/Card';
import type { Agent } from '@/types';

const agents: Agent[] = [
  { id: '1', name: 'Market Scanner', type: 'scanner', status: 'standby' },
  { id: '2', name: 'Thesis Builder', type: 'thesis', status: 'standby' },
  { id: '3', name: 'Risk Manager', type: 'risk', status: 'standby' },
  { id: '4', name: 'Pattern Analyst', type: 'pattern', status: 'standby' },
  { id: '5', name: 'Briefing Agent', type: 'briefing', status: 'standby' },
  { id: '6', name: 'Trade Logger', type: 'journal', status: 'standby' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <MorningBriefing />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SignalCard label="Active Signals" value={0} accent="green" />
        <SignalCard label="High Conviction" value={0} accent="yellow" />
        <SignalCard label="Alerts Today" value={0} accent="blue" />
      </div>

      <Card>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Recent Signals</h2>
        <div className="mt-4 overflow-x-auto">
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
              <tr>
                <td colSpan={5} className="py-12 text-center text-text-secondary">
                  Recon agents are warming up. Signals will appear here.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
