import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function TradeEntry() {
  return (
    <Card>
      <h2 className="font-heading text-lg font-semibold text-text-primary">New Trade Entry</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Log your trade thesis, entry notes, and lessons learned.
      </p>
      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-muted">
            Ticker
          </label>
          <input
            type="text"
            placeholder="AAPL"
            disabled
            className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-muted">
            Entry Notes
          </label>
          <textarea
            rows={4}
            placeholder="Why are you entering this trade?"
            disabled
            className="w-full resize-none rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none disabled:opacity-50"
          />
        </div>
        <Button disabled>Save Entry</Button>
      </div>
    </Card>
  );
}
