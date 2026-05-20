import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { Position } from '@/types';

interface PositionCardProps {
  position: Position;
}

export default function PositionCard({ position }: PositionCardProps) {
  const pnl = position.pnl ?? (position.current_price - position.entry_price) * position.quantity;
  const pnlPercent = ((position.current_price - position.entry_price) / position.entry_price) * 100;
  const isProfit = pnl >= 0;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-lg font-bold text-text-primary">{position.ticker}</p>
          <p className="mt-1 text-xs uppercase text-text-secondary">{position.position_type}</p>
        </div>
        <Badge variant={position.status === 'open' ? 'green' : 'muted'}>{position.status}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-muted">Entry</p>
          <p className="font-mono text-text-primary">{formatCurrency(position.entry_price)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Current</p>
          <p className="font-mono text-text-primary">{formatCurrency(position.current_price)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-text-muted">P&L</span>
        <span className={`font-mono text-sm font-medium ${isProfit ? 'text-accent-green' : 'text-accent-red'}`}>
          {formatCurrency(pnl)} ({formatPercent(pnlPercent)})
        </span>
      </div>
    </Card>
  );
}
