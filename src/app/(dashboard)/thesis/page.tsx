import ThesisBuilder from '@/components/thesis/ThesisBuilder';

export default function ThesisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">Thesis Builder</h1>
        <p className="mt-1 text-sm text-text-secondary">
          AI-powered bull/bear analysis, options setup, and conviction scoring in 60 seconds.
        </p>
      </div>
      <ThesisBuilder />
    </div>
  );
}
