"use client";

import { motion } from "framer-motion";
import { Cpu, Zap, Cloud, GitMerge } from "lucide-react";
import { techCards } from "@/shared/lib/data";
import { slideUp, staggerContainer } from "@/shared/lib/animations";

export function TechCards() {
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
            <span className="gradient-text">Technical Deep Dive</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Production-grade engineering choices for reliability and performance
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto"
        >
          {techCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                variants={slideUp}
                className="group"
              >
                <div className="glass-card glass-card-hover p-8 h-full">
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-white mb-3">{card.title}</h3>
                  <p className="text-gray-400 mb-6">{card.description}</p>

                  {/* Details */}
                  <ul className="space-y-3">
                    {card.details.map((detail, detailIndex) => (
                      <li key={detailIndex} className="flex items-start gap-2 text-gray-300">
                        <span className={`text-accent-light mt-1 flex-shrink-0`}>▹</span>
                        <span className="text-sm">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
