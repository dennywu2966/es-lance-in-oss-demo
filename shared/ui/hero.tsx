"use client";

import { motion } from "framer-motion";
import { ArrowDown, BookOpen, Cloud, MemoryStick } from "lucide-react";
import { statsBadges } from "@/shared/lib/data";
import { fadeIn, slideUp } from "@/shared/lib/animations";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-30" />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-dark/50 to-dark" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 py-20 text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="mb-8"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-sm font-medium mb-6">
            Production-Ready Vector Search
          </span>
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={slideUp}
          className="text-5xl md:text-7xl font-bold mb-6"
        >
          <span className="gradient-text">Production-Ready</span>
          <br />
          <span className="text-white">Vector Search at Scale</span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={slideUp}
          transition={{ delay: 0.2 }}
          className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto"
        >
          High-performance kNN search with cloud storage integration.
          <br />
          Memory-safe, tested, and scalable.
        </motion.p>

        {/* Stats Badges */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="flex flex-wrap justify-center gap-4 mb-12"
        >
          {statsBadges.map((badge, index) => {
            const Icon = badge.icon;
            return (
              <motion.div
                key={badge.label}
                variants={slideUp}
                className="glass-card px-6 py-4 flex items-center gap-3"
              >
                <Icon className="w-5 h-5 text-primary-light" />
                <span className="text-white font-semibold">{badge.value}</span>
                <span className="text-gray-400 text-sm">{badge.label}</span>
              </motion.div>
            );
          })}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={slideUp}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <a
            href="#live-demo"
            className="group relative px-8 py-4 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg overflow-hidden transition-all duration-300"
          >
            <span className="relative z-10 flex items-center gap-2">
              See It In Action
              <ArrowDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-primary-light to-accent-light opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
          <a
            href="/docs"
            className="group px-8 py-4 glass-card glass-card-hover text-white font-semibold rounded-lg transition-all duration-300"
          >
            <span className="flex items-center gap-2">
              View Documentation
              <BookOpen className="w-4 h-4" />
            </span>
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-gray-500"
          >
            <ArrowDown className="w-6 h-6" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function staggerContainer() {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };
}
