import Badge from '@/components/ui/Badge';
import type { Signal } from '@/types';

interface SignalItemProps {
  signal: Signal;
}

export default function SignalItem({ signal }: SignalItemProps) {
  const strengthVariant =
    signal.strength === 'high' ? 'green' : signal.strength === 'medium' ? 'yellow' : 'muted';

  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm font-bold text-text-primary">{signal.ticker}</span>
        <span className="text-xs text-text-secondary">{signal.signal_type.replace('_', ' ')}</span>
      </div>
      <div className="flex items-center gap-4">
        <Badge variant={strengthVariant}>{signal.strength}</Badge>
        <span className="hidden text-xs text-text-muted sm:inline">{signal.agent}</span>
        <span className="font-mono text-xs text-text-muted">
          {new Date(signal.created_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
