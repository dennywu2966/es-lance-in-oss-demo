import Link from "next/link";

import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { VectorManagement } from "@/features/vector-mgmt";
import { LiveDemo } from "@/features/live-demo";

export default function CoreFlowPage() {
  return (
    <main className="min-h-screen bg-dark">
      <SiteNav lang="en" section="core-flow" />

      <section className="relative overflow-hidden px-6 pb-10 pt-16">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-dark">
            Core Product Flow
          </p>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-5xl">
            Generate, Backfill, and Search in One Operational Loop
          </h1>
          <p className="mt-4 max-w-3xl text-gray-500">
            This page is the primary validation path. Use it to create datasets, push them into Elasticsearch, and run
            kNN or hybrid requests with request-level evidence.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="glass-card p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Phase 01</p>
              <p className="mt-2 text-base font-semibold text-white">Dataset Engineering</p>
              <p className="mt-1 text-sm text-gray-500">Generate shard-aware datasets and manage lifecycle safely.</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Phase 02</p>
              <p className="mt-2 text-base font-semibold text-white">Index Activation</p>
              <p className="mt-1 text-sm text-gray-500">Backfill to Elasticsearch and validate mappings and source readiness.</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Phase 03</p>
              <p className="mt-2 text-base font-semibold text-white">Search Verification</p>
              <p className="mt-1 text-sm text-gray-500">Run kNN/hybrid queries and capture evidence for rollout decisions.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#vector-management"
              className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/20"
            >
              Jump to Dataset Management
            </Link>
            <Link
              href="#live-demo"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Jump to Live Search
            </Link>
          </div>
        </div>
      </section>

      <VectorManagement />
      <LiveDemo />

      <section className="px-6 pb-4">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Need positioning and rollout artifacts?</h2>
            <p className="mt-2 text-sm text-gray-500">
              Visit the Solutions page for audience-specific narratives, lighthouse storylines, and TTV sales playbooks.
            </p>
            <Link
              href="/solutions"
              className="mt-4 inline-flex rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/20"
            >
              Open Solutions
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter lang="en" />
    </main>
  );
}
