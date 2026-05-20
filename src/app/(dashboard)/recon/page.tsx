import ReconFeed from '@/components/recon/ReconFeed';

export default function ReconPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">Recon Feed</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Live market reconnaissance from autonomous agents.
        </p>
      </div>
      <ReconFeed />
    </div>
  );
}
