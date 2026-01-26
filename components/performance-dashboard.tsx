"use client";

import { motion } from "framer-motion";
import { TrendingUp, Cpu, Database, Zap } from "lucide-react";
import { performanceMetrics } from "@/lib/data";
import { slideUp, progressAnimation } from "@/lib/animations";
import { useEffect, useState } from "react";

export function PerformanceDashboard() {
  const [animatedMetrics, setAnimatedMetrics] = useState({
    searchLatency: 0,
    memoryUsage: 0,
    datasetSize: 0,
  });

  useEffect(() => {
    // Animate metrics on mount
    const duration = 1500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      setAnimatedMetrics({
        searchLatency: performanceMetrics.searchLatency.value * easeOutQuad(progress),
        memoryUsage: (90 * progress), // 90% of 256MB cap
        datasetSize: performanceMetrics.datasetSize.value * easeOutQuad(progress),
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, []);

  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={slideUp}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Performance Metrics</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Validated performance with real-world workloads
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {/* Search Latency */}
          <MetricCard
            icon={Zap}
            label={performanceMetrics.searchLatency.label}
            value={`${animatedMetrics.searchLatency.toFixed(1)} ${performanceMetrics.searchLatency.unit}`}
            color="from-yellow-500 to-orange-500"
            delay={0}
          />

          {/* Memory Usage */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={slideUp}
            transition={{ delay: 0.1 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">{performanceMetrics.memoryCap.label}</p>
                <p className="text-2xl font-bold text-white">
                  {animatedMetrics.memoryUsage.toFixed(0)}%
                </p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${animatedMetrics.memoryUsage}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
              />
            </div>
            <p className="text-gray-500 text-xs mt-2">256MB cap enforced</p>
          </motion.div>

          {/* Dataset Size */}
          <MetricCard
            icon={Database}
            label={performanceMetrics.datasetSize.label}
            value={`${Math.floor(animatedMetrics.datasetSize)} ${performanceMetrics.datasetSize.unit}`}
            color="from-emerald-500 to-teal-500"
            delay={0.2}
          />

          {/* Index Type */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={slideUp}
            transition={{ delay: 0.3 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">{performanceMetrics.indexType.label}</p>
                <p className="text-2xl font-bold text-white">
                  {performanceMetrics.indexType.value}
                </p>
              </div>
            </div>
            <p className="text-gray-500 text-xs">
              {performanceMetrics.indexType.description}
            </p>
          </motion.div>
        </div>

        {/* Comparison Chart */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={slideUp}
          transition={{ delay: 0.4 }}
          className="mt-16 max-w-4xl mx-auto"
        >
          <div className="glass-card p-8">
            <h3 className="text-xl font-bold text-white mb-6 text-center">
              Memory Usage Comparison
            </h3>
            <div className="space-y-6">
              {/* Traditional Approach */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Traditional In-Memory</span>
                  <span className="text-red-400 font-semibold">~2GB</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>

              {/* Our Approach */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Lance + OSS (256MB cap)</span>
                  <span className="text-emerald-400 font-semibold">256MB</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "12%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                  />
                </div>
                <p className="text-emerald-400 text-sm mt-1">~88% memory reduction</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  delay,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={slideUp}
      transition={{ delay }}
      className="glass-card p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-gray-400 text-sm">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </motion.div>
  );
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}
