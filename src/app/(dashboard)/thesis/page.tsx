import { Suspense } from 'react';
import ThesisPageClient from './ThesisPageClient';

export default function ThesisPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[900px] px-3.5 py-6 font-mono text-sm text-text-muted md:p-6">
          Loading thesis builder…
        </div>
      }
    >
      <ThesisPageClient />
    </Suspense>
  );
}
