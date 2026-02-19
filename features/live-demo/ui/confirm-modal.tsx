/**
 * Confirmation Modal Component
 *
 * Shows search parameters before execution
 */

"use client";

import { motion } from "framer-motion";

interface ConfirmModalProps {
  isHybridMode: boolean;
  topK: number;
  queryText: string;
  useExistingVector: boolean;
  hasLastVector: boolean;
  enableProfiling: boolean;
  datasetName?: string;
  vectorsCount?: number;
  queryDimension?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isHybridMode,
  topK,
  queryText,
  useExistingVector,
  hasLastVector,
  enableProfiling,
  datasetName,
  vectorsCount,
  queryDimension,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="modal-panel rounded-lg p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-2xl font-bold text-white mb-4">
          {isHybridMode ? 'Confirm Hybrid Search' : 'Confirm kNN Search'}
        </h3>
        <p className="text-gray-400 mb-6">
          Execute {isHybridMode ? 'hybrid (text + vector fusion)' : 'kNN'} search
          {enableProfiling ? ' with profiling' : ''} against live Lance dataset
          {useExistingVector && hasLastVector ? ' using current query vector' : ''}?
        </p>
        <div className="rounded-lg border border-gray-600/40 bg-black/20 p-4 mb-6 font-mono text-sm space-y-1">
          <p className="text-gray-400">• Dataset: <span className="text-white">{datasetName || "Latest available"}</span></p>
          <p className="text-gray-400">• Dataset size: <span className="text-white">{vectorsCount || "N/A"} vectors, {queryDimension || "N/A"} dims</span></p>

          {isHybridMode ? (
            <>
              <p className="text-gray-400">• Query Text: <span className="text-white">"{queryText}"</span></p>
              <p className="text-gray-400">• Fusion Method: <span className="text-white">RRF (Reciprocal Rank Fusion)</span></p>
            </>
          ) : (
            <>
              <p className="text-gray-400">• Query Vector: <span className="text-white">{useExistingVector && hasLastVector ? "Keep Current" : "Generate New"}</span></p>
            </>
          )}

          <p className="text-gray-400">• Top-K results: <span className="text-white">{topK}</span></p>
          <p className="text-gray-400">• Profiling: <span className={enableProfiling ? "text-accent" : "text-gray-500"}>{enableProfiling ? "Enabled" : "Disabled"}</span></p>
          <p className="text-gray-400">• Storage: <span className="text-white">Alibaba Cloud OSS + Elasticsearch</span></p>
          <p className="text-gray-400">• Index type: <span className="text-white">IVF-PQ</span></p>
          <p className="text-gray-400">• Similarity: <span className="text-white">Cosine (normalized)</span></p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors font-semibold"
          >
            Confirm & Search
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
