import Link from "next/link";

import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { PerformanceDashboard } from "@/components/performance-dashboard";

const segments = [
  {
    audience: "Platform Engineering",
    scenario: "Replace memory-heavy ANN clusters while preserving Elasticsearch governance and security controls.",
    value: "Stable cost envelope and clearer operational ownership.",
  },
  {
    audience: "Applied AI Teams",
    scenario: "Launch retrieval-augmented assistants where relevance needs both semantic and keyword signals.",
    value: "Hybrid retrieval without a second serving stack.",
  },
  {
    audience: "Enterprise Solution Leads",
    scenario: "Need a demo journey that proves technical fit and business impact in executive reviews.",
    value: "Credible proof points with measurable rollout milestones.",
  },
];

const ttvStages = [
  {
    title: "Day 0: Readiness",
    detail: "Align source datasets, index naming policy, and acceptance thresholds for latency and hit quality.",
  },
  {
    title: "Day 1: Pilot",
    detail: "Run core flow with realistic shards and filters. Capture screenshots, ES request payloads, and profiling deltas.",
  },
  {
    title: "Day 3-7: Business Validation",
    detail: "Map retrieval wins to user journeys and convert technical evidence into a decision memo for scale-up.",
  },
];

const lighthouse = [
  {
    name: "Commerce Search Modernization",
    fit: "Large catalog vectors with seasonal traffic swings",
    outcome: "Reduced memory pressure and improved rollout confidence through deterministic regression checks.",
  },
  {
    name: "Internal Knowledge Assistant",
    fit: "Need lexical precision and semantic recall",
    outcome: "Adopted hybrid search with request evidence to tune quality faster across teams.",
  },
  {
    name: "Risk Review Intelligence",
    fit: "Strict auditability requirements",
    outcome: "Maintained Elasticsearch-centric controls while externalizing vector payloads to OSS.",
  },
];

export default function SolutionsPage() {
  return (
    <main className="min-h-screen bg-dark">
      <SiteNav lang="en" section="solutions" />

      <section className="relative overflow-hidden px-6 pb-12 pt-16">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-dark">
            Positioning and GTM
          </p>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-5xl">
            Audience-Fit Narratives for Branding, Sales, and Adoption
          </h1>
          <p className="mt-4 max-w-3xl text-gray-500">
            Use this page to package the product story: who it is for, where it wins, and how to prove value quickly.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/core-flow"
              className="rounded-full border border-primary/40 bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Run Core Flow
            </Link>
            <Link
              href="/docs/branding-saling-strategies.md"
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Open Branding Playbook
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">Audience and Scenario Mapping</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {segments.map((item) => (
              <article key={item.audience} className="glass-card p-5">
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500">{item.audience}</p>
                <p className="mt-2 text-sm text-white">{item.scenario}</p>
                <p className="mt-3 text-sm font-semibold text-primary-dark">{item.value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">Time-to-Value Method</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {ttvStages.map((stage) => (
              <article key={stage.title} className="glass-card p-5">
                <p className="text-sm font-semibold text-white">{stage.title}</p>
                <p className="mt-2 text-sm text-gray-500">{stage.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">Lighthouse Story Templates</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {lighthouse.map((item) => (
              <article key={item.name} className="glass-card p-5">
                <p className="text-base font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-sm text-gray-500">Fit: {item.fit}</p>
                <p className="mt-3 text-sm text-primary-dark">{item.outcome}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PerformanceDashboard />

      <SiteFooter lang="en" />
    </main>
  );
}
