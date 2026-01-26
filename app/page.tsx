import { Hero } from "@/components/hero";
import { Architecture } from "@/components/architecture";
import { ValidationTimeline } from "@/components/validation-timeline";
import { PerformanceDashboard } from "@/components/performance-dashboard";
import { VectorManagement } from "@/components/vector-management";
import { LiveDemo } from "@/components/live-demo";
import { TechCards } from "@/components/tech-cards";
import { CodePreview } from "@/components/code-preview";
import { CTA } from "@/components/cta";

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
      <PerformanceDashboard />

      {/* Vector Management System */}
      <VectorManagement />

      {/* Live Demo */}
      <LiveDemo />

      {/* Technical Deep Dive */}
      <TechCards />

      {/* Code Preview */}
      <CodePreview />

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
