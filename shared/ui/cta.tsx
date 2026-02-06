"use client";

import { motion } from "framer-motion";
import { Shield, Rocket, TrendingUp, CheckCircle2, ArrowRight } from "lucide-react";
import { ctaContent } from "@/shared/lib/data";
import { slideUp, staggerContainer } from "@/shared/lib/animations";

export function CTA() {
  return (
    <section className="py-20 relative">
      {/* Background effects */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-t from-primary/20 to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={slideUp}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">{ctaContent.title}</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            {ctaContent.description}
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-16"
        >
          {ctaContent.features.map((feature, index) => {
            const Icon = feature.title === "Memory Safe" ? Shield :
                        feature.title === "Battle Tested" ? CheckCircle2 :
                        feature.title === "Cloud Native" ? Rocket : TrendingUp;
            return (
              <motion.div
                key={feature.title}
                variants={slideUp}
                className="glass-card p-6 text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Next Steps */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-3xl mx-auto"
        >
          <div className="glass-card p-8 mb-8">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Rocket className="w-5 h-5 text-accent-light" />
              Roadmap
            </h3>
            <ul className="space-y-3">
              {ctaContent.nextSteps.map((step, index) => (
                <li key={index} className="flex items-start gap-3 text-gray-300">
                  <span className="text-accent-light mt-1">▹</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Final CTA */}
          <div className="text-center">
            <motion.a
              href="#contact"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-accent hover:from-primary-dark hover:to-accent-dark text-white font-semibold rounded-lg transition-all duration-300 group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Ready to Deploy?
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </motion.a>
            <p className="text-gray-500 text-sm mt-4">
              Contact the team for production deployment guidance
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
