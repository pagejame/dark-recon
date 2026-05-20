import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Agent } from '@/types';

interface AgentStatusProps {
  agent: Agent;
}

export default function AgentStatus({ agent }: AgentStatusProps) {
  const statusVariant =
    agent.status === 'active' ? 'green' : agent.status === 'error' ? 'red' : 'muted';

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{agent.name}</p>
        <Badge variant={statusVariant}>
          {agent.status === 'active' && (
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-dot" />
          )}
          {agent.status}
        </Badge>
      </div>
      <p className="font-mono text-xs text-text-muted">
        Last run: {agent.last_run ? new Date(agent.last_run).toLocaleString() : 'Never'}
      </p>
    </Card>
  );
}
