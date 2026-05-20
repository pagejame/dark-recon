import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function ThesisBuilder() {
  return (
    <Card>
      <h2 className="font-heading text-lg font-semibold text-text-primary">Thesis Builder</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Select a signal to generate an AI-powered investment thesis.
      </p>
      <div className="mt-6 rounded-md border border-border bg-bg-secondary p-8 text-center">
        <p className="text-sm text-text-muted">No signal selected</p>
        <Button variant="secondary" size="sm" className="mt-4" disabled>
          Generate Thesis
        </Button>
      </div>
    </Card>
  );
}
