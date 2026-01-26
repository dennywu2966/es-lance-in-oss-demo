"use client";

import { motion } from "framer-motion";
import { Code, Copy, Check } from "lucide-react";
import { codeExamples } from "@/lib/data";
import { slideUp } from "@/lib/animations";
import { useState } from "react";

export function CodePreview() {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            <span className="gradient-text">Simple Integration</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Get started with just a few lines of configuration
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-4xl mx-auto"
        >
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {codeExamples.map((example, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                  activeTab === index
                    ? "bg-primary text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  {example.title}
                </span>
              </button>
            ))}
          </div>

          {/* Code Block */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
              <span className="text-gray-400 text-sm">{codeExamples[activeTab].title}</span>
              <button
                onClick={() => handleCopy(codeExamples[activeTab].code)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="p-6 overflow-x-auto">
              <code className="text-sm text-gray-300 font-mono">
                {codeExamples[activeTab].code}
              </code>
            </pre>
          </div>

          {/* Description */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10"
          >
            <p className="text-gray-400 text-sm">
              {activeTab === 0 && "Configure the Lance vector field with OSS storage and IVF-PQ indexing for optimal performance."}
              {activeTab === 1 && "Execute kNN searches using the standard Elasticsearch search API with automatic Lance integration."}
              {activeTab === 2 && "Configure OSS credentials and memory settings in your Elasticsearch configuration file."}
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
