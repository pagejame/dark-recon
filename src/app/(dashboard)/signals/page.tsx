import Card from '@/components/ui/Card';

export default function SignalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">Signals</h1>
        <p className="mt-1 text-sm text-text-secondary">
          All detected market signals ranked by conviction.
        </p>
      </div>
      <Card>
        <p className="py-8 text-center text-sm text-text-secondary">
          No signals detected yet. Agents are on standby.
        </p>
      </Card>
    </div>
  );
}
