import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Signal } from '@/types';

interface SignalCardProps {
  signal?: Signal;
  label?: string;
  value?: number;
  accent?: 'green' | 'blue' | 'yellow';
}

export default function SignalCard({ signal, label, value, accent = 'green' }: SignalCardProps) {
  if (label !== undefined && value !== undefined) {
    return (
      <Card accent={accent}>
        <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
        <p className="mt-2 font-mono text-3xl font-bold text-text-primary">{value}</p>
      </Card>
    );
  }

  if (!signal) return null;

  const strengthVariant =
    signal.strength === 'high' ? 'green' : signal.strength === 'medium' ? 'yellow' : 'muted';

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-lg font-bold text-text-primary">{signal.ticker}</p>
          <p className="mt-1 text-xs text-text-secondary">{signal.signal_type.replace('_', ' ')}</p>
        </div>
        <Badge variant={strengthVariant}>{signal.strength}</Badge>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-text-secondary">{signal.thesis}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
        <span>{signal.agent}</span>
        <span>{new Date(signal.created_at).toLocaleTimeString()}</span>
      </div>
    </Card>
  );
}
