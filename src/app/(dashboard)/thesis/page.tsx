import { Suspense } from 'react';
import ThesisPageClient from './ThesisPageClient';

export default function ThesisPage() {
  return (
    <Suspense
      fallback={
        <div className="dr-page dr-page-narrow">
          Loading thesis builder…
        </div>
      }
    >
      <ThesisPageClient />
    </Suspense>
  );
}
