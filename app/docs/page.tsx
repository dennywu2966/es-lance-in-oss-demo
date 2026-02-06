import { Suspense } from 'react';
import { DocsLayout } from '@/features/docs-viewer';

export default function DocsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading documentation...</div>
      </div>
    }>
      <DocsLayout />
    </Suspense>
  );
}
