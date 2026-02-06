import { Hero, Architecture, CTA, ValidationTimeline, WaterfallTimeline } from "@/shared/ui";
import { PerformanceDashboard } from "@/components/performance-dashboard";
import { VectorManagement } from "@/features/vector-mgmt";
import { LiveDemo } from "@/features/live-demo";
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Lazy load heavy below-the-fold components
const TechCards = dynamic(() => import('@/shared/ui').then(mod => ({ default: mod.TechCards })), {
  loading: () => (
    <section className="py-20 relative">
      <div className="container mx-auto px-6">
        <div className="animate-pulse bg-white/5 rounded-lg h-64" />
      </div>
    </section>
  ),
});

const CodePreview = dynamic(() => import('@/shared/ui').then(mod => ({ default: mod.CodePreview })), {
  loading: () => (
    <section className="py-20 relative">
      <div className="container mx-auto px-6">
        <div className="animate-pulse bg-white/5 rounded-lg h-96" />
      </div>
    </section>
  ),
});

// Lazy load feature components
const LazyVectorManagement = dynamic(() => import('@/features/vector-mgmt').then(mod => ({ default: mod.VectorManagement })), {
  loading: () => (
    <section className="py-20 relative">
      <div className="container mx-auto px-6 text-center">
        <div className="animate-pulse bg-white/5 rounded-lg h-64" />
      </div>
    </section>
  ),
});

const LazyLiveDemo = dynamic(() => import('@/features/live-demo').then(mod => ({ default: mod.LiveDemo })), {
  loading: () => (
    <section className="py-20 relative">
      <div className="container mx-auto px-6 text-center">
        <div className="animate-pulse bg-white/5 rounded-lg h-64" />
      </div>
    </section>
  ),
});

const LazyPerformanceDashboard = dynamic(() => import('@/components/performance-dashboard').then(mod => ({ default: mod.PerformanceDashboard })), {
  loading: () => (
    <section className="py-20 relative">
      <div className="container mx-auto px-6 text-center">
        <div className="animate-pulse bg-white/5 rounded-lg h-64" />
      </div>
    </section>
  ),
});

export default function Home() {
  return (
    <main className="min-h-screen bg-dark">
      {/* Hero Section */}
      <Hero />

      {/* Problem Statement */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              <span className="text-white">The Challenge:</span>{" "}
              <span className="gradient-text-orange">Vector Search at Scale</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
              <div className="glass-card p-6">
                <h3 className="text-xl font-bold text-red-400 mb-4">Traditional Approach</h3>
                <ul className="space-y-3 text-gray-400 text-left">
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">✗</span>
                    <span>All vectors in memory = expensive clusters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">✗</span>
                    <span>Memory scales linearly with dataset size</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">✗</span>
                    <span>OOM crashes during concurrent searches</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">✗</span>
                    <span>Limited by node memory capacity</span>
                  </li>
                </ul>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-xl font-bold text-emerald-400 mb-4">Our Solution</h3>
                <ul className="space-y-3 text-gray-400 text-left">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">✓</span>
                    <span>External Lance storage with OSS/S3</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">✓</span>
                    <span>256MB memory cap enforced</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">✓</span>
                    <span>Rust-powered SIMD vectorization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">✓</span>
                    <span>Scales to millions of vectors</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <Architecture />

      {/* Validation Timeline */}
      <ValidationTimeline />

      {/* Performance Dashboard */}
      <Suspense fallback={<div className="py-20"><div className="animate-pulse bg-white/5 rounded-lg h-64 mx-6" /></div>}>
        <LazyPerformanceDashboard />
      </Suspense>

      {/* Vector Management System */}
      <Suspense fallback={<div className="py-20"><div className="animate-pulse bg-white/5 rounded-lg h-64 mx-6" /></div>}>
        <LazyVectorManagement />
      </Suspense>

      {/* Live Demo */}
      <Suspense fallback={<div className="py-20"><div className="animate-pulse bg-white/5 rounded-lg h-64 mx-6" /></div>}>
        <LazyLiveDemo />
      </Suspense>

      {/* Technical Deep Dive */}
      <Suspense fallback={<div className="py-20"><div className="animate-pulse bg-white/5 rounded-lg h-64 mx-6" /></div>}>
        <TechCards />
      </Suspense>

      {/* Code Preview */}
      <Suspense fallback={<div className="py-20"><div className="animate-pulse bg-white/5 rounded-lg h-64 mx-6" /></div>}>
        <CodePreview />
      </Suspense>

      {/* CTA Section */}
      <CTA />

      {/* Footer */}
      <footer className="py-12 border-t border-white/10">
        <div className="container mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm">
            Lance Vector Plugin for Elasticsearch • Production-Ready Vector Search at Scale
          </p>
          <p className="text-gray-600 text-xs mt-2">
            Powered by Apache Arrow • Lance Rust Engine • Alibaba Cloud OSS
          </p>
        </div>
      </footer>
    </main>
  );
}
