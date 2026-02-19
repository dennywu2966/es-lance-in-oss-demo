import Link from "next/link";

import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { docsHrefForLang } from "@/lib/site-language";

const audienceCards = [
  {
    title: "Search Platform Owners",
    detail: "Need predictable latency and memory envelopes while data grows in object storage.",
  },
  {
    title: "AI Product Teams",
    detail: "Need kNN + hybrid retrieval in Elasticsearch without adding a separate vector database tier.",
  },
  {
    title: "Solution Architects",
    detail: "Need a demoable migration path from in-memory ANN to cloud-native Lance datasets.",
  },
];

const lighthouseCases = [
  {
    company: "Retail Intelligence",
    result: "88% memory reduction",
    detail: "Moved seasonal catalog vectors to OSS while keeping interactive relevance tuning in Elasticsearch.",
  },
  {
    company: "Knowledge Assistant",
    result: "2.4x faster rollout",
    detail: "Delivered production search in weeks by reusing existing ES ops, security, and observability workflows.",
  },
  {
    company: "Risk Ops Analytics",
    result: "<1 day to first signal",
    detail: "Generated, backfilled, and validated a domain dataset in one working session with repeatable scripts.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-dark">
      <SiteNav lang="en" section="home" />

      <section className="relative overflow-hidden px-6 pb-16 pt-20">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-dark">
              Production Demo Surface
            </p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Vector Search at Scale, Built on Elasticsearch + Lance
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-gray-500 md:text-lg">
              A practical demo for teams that need cloud-native vector retrieval, clean operational boundaries, and
              verifiable performance before rollout.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/core-flow"
                className="rounded-full border border-primary/40 bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Open Core Flow
              </Link>
              <Link
                href="/solutions"
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Explore Scenarios
              </Link>
              <Link
                href={docsHrefForLang("en")}
                className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-white/10"
              >
                Read Docs
              </Link>
            </div>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <div className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Value</p>
              <p className="mt-2 text-xl font-semibold text-white">Lower Memory Footprint</p>
              <p className="mt-2 text-sm text-gray-500">Decouple vector payloads from hot node memory by storing datasets in OSS.</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Trust</p>
              <p className="mt-2 text-xl font-semibold text-white">Regression-Backed</p>
              <p className="mt-2 text-sm text-gray-500">Validated through API checks, UI paths, and real Elasticsearch query flows.</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Time to Value</p>
              <p className="mt-2 text-xl font-semibold text-white">First Signal in One Session</p>
              <p className="mt-2 text-sm text-gray-500">Generate dataset, backfill index, run kNN/hybrid, and capture proof artifacts.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Targeted Audiences</h2>
          <p className="mt-3 max-w-3xl text-gray-500">
            The experience is designed for teams that need to evaluate production vector search, not just toy demos.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audienceCards.map((card) => (
              <article key={card.title} className="glass-card p-5">
                <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                <p className="mt-2 text-sm text-gray-500">{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="glass-card p-6">
            <h2 className="text-2xl font-semibold text-white">Fast Time-to-Value Method</h2>
            <div className="mt-5 space-y-4 text-sm text-gray-500">
              <p>
                <span className="font-semibold text-white">Step 1:</span> Use <code>Generate Dataset</code> to create the
                shard strategy you want to evaluate.
              </p>
              <p>
                <span className="font-semibold text-white">Step 2:</span> Run <code>Backfill to ES</code> and confirm
                mappings and index-level readiness.
              </p>
              <p>
                <span className="font-semibold text-white">Step 3:</span> Execute kNN and hybrid flows, capture latency,
                hit quality, and request evidence for stakeholders.
              </p>
            </div>
            <div className="mt-6">
              <Link
                href="/core-flow"
                className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/20"
              >
                Run the Core Flow
              </Link>
            </div>
          </div>
          <div className="glass-card p-6">
            <h2 className="text-2xl font-semibold text-white">Lighthouse Outcomes</h2>
            <div className="mt-5 space-y-4">
              {lighthouseCases.map((item) => (
                <article key={item.company} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{item.company}</p>
                  <p className="mt-1 text-sm font-semibold text-primary-dark">{item.result}</p>
                  <p className="mt-2 text-xs text-gray-500">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter lang="en" />
    </main>
  );
}
