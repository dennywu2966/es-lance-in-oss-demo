"use client";

import { motion } from "framer-motion";
import { Database, Zap, Cpu, Archive, Cloud } from "lucide-react";
import { architectureComponents } from "@/lib/data";
import { slideUp } from "@/lib/animations";

export function Architecture() {
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
            <span className="gradient-text">Architecture</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Seamless integration between Elasticsearch and cloud-native vector storage
          </p>
        </motion.div>

        {/* Architecture Diagram */}
        <div className="relative max-w-5xl mx-auto">
          <motion.svg
            className="w-full h-[500px]"
            viewBox="0 0 1000 500"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {/* Connection lines */}
            <motion.g
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            >
              {/* ES to Lance Plugin */}
              <line x1="200" y1="250" x2="400" y2="250" stroke="url(#gradient1)" strokeWidth="3" strokeDasharray="5,5" />
              {/* Lance Plugin to Arrow Memory */}
              <line x1="400" y1="250" x2="600" y2="150" stroke="url(#gradient1)" strokeWidth="3" strokeDasharray="5,5" />
              {/* Lance Plugin to Lance Dataset */}
              <line x1="400" y1="250" x2="600" y2="350" stroke="url(#gradient1)" strokeWidth="3" strokeDasharray="5,5" />
              {/* Lance Dataset to OSS */}
              <line x1="600" y1="350" x2="800" y2="250" stroke="url(#gradient1)" strokeWidth="3" strokeDasharray="5,5" />
            </motion.g>

            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
            </defs>

            {/* Component nodes */}
            {architectureComponents.map((component, index) => {
              const Icon = component.icon;
              const x = component.position.x * 10;
              const y = component.position.y * 5;

              return (
                <motion.g
                  key={component.id}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.4 }}
                >
                  {/* Node circle */}
                  <foreignObject x={x - 40} y={y - 40} width="80" height="80">
                    <div className={`w-20 h-20 rounded-full bg-dark-light border-2 ${component.color.replace('text-', 'border-')} flex items-center justify-center relative z-10`}>
                      <Icon className={`w-8 h-8 ${component.color}`} />
                    </div>
                  </foreignObject>

                  {/* Label */}
                  <text x={x} y={y + 55} textAnchor="middle" className="fill-white text-sm font-semibold">
                    {component.name}
                  </text>
                </motion.g>
              );
            })}
          </motion.svg>

          {/* Hover cards for each component */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {architectureComponents.map((component, index) => {
              const Icon = component.icon;
              return (
                <motion.div
                  key={component.id}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={slideUp}
                  transition={{ delay: index * 0.1 }}
                  className="glass-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${component.color.replace('text-', 'bg-').replace('-400', '-400/20')}`}>
                      <Icon className={`w-5 h-5 ${component.color}`} />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold mb-1">{component.name}</h3>
                      <p className="text-gray-400 text-sm">{component.description}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
