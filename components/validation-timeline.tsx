"use client";

import { motion } from "framer-motion";
import { Code2, Shield, Activity, Cloud, ChevronDown } from "lucide-react";
import { validationPhases } from "@/lib/data";
import { expandCollapse, slideUp } from "@/lib/animations";
import { useState } from "react";

export function ValidationTimeline() {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

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
            <span className="gradient-text-orange">Validation Journey</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            From concept to production-ready implementation
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          {validationPhases.map((phase, index) => {
            const Icon = phase.icon;
            const isExpanded = expandedPhase === phase.phase;

            return (
              <motion.div
                key={phase.phase}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={slideUp}
                transition={{ delay: index * 0.1 }}
                className="relative mb-8 last:mb-0"
              >
                {/* Timeline line */}
                {index !== validationPhases.length - 1 && (
                  <div className="absolute left-8 top-16 w-0.5 h-full bg-gradient-to-b from-gray-700 to-transparent" />
                )}

                <div className="flex gap-6">
                  {/* Icon */}
                  <div className={`relative z-10 w-16 h-16 rounded-xl bg-gradient-to-br ${phase.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : phase.phase)}
                      className="w-full text-left glass-card p-6 hover:border-white/20 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-semibold px-2 py-1 rounded bg-white/10 text-gray-300">
                              Phase {phase.phase}
                            </span>
                            <h3 className="text-xl font-bold text-white">{phase.title}</h3>
                          </div>
                          <p className="text-gray-400">{phase.summary}</p>
                        </div>
                        <ChevronDown
                          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </button>

                    {/* Expandable details */}
                    <motion.div
                      initial="collapsed"
                      animate={isExpanded ? "expanded" : "collapsed"}
                      variants={expandCollapse}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 ml-4 p-4 glass-card glass-card-hover">
                        <ul className="space-y-2">
                          {phase.details.map((detail, detailIndex) => (
                            <li key={detailIndex} className="flex items-start gap-2 text-gray-300">
                              <span className="text-primary-light mt-1">•</span>
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
