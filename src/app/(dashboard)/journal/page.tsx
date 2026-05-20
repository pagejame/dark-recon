import TradeEntry from '@/components/journal/TradeEntry';
import Card from '@/components/ui/Card';

export default function JournalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">Trade Journal</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Document trades, track results, and capture lessons.
        </p>
      </div>
      <TradeEntry />
      <Card>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Recent Entries</h2>
        <p className="mt-4 py-8 text-center text-sm text-text-secondary">
          No journal entries yet.
        </p>
      </Card>
    </div>
  );
}
