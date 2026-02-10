/**
 * Results Display Component
 *
 * Shows search results, timing breakdown, and ES request JSON
 */

"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Activity, Eye, Database, Code, FileText, RotateCw } from "lucide-react";
import { WaterfallTimeline } from "@/shared/ui";

interface ResultsDisplayProps {
  searchState: any;
  isHybridMode: boolean;
  topK: number;
  enableProfiling: boolean;
  queryText: string;
  queryVector?: number[];
  showEsRequest: boolean;
  setShowEsRequest: (value: boolean) => void;
  expandedResults: Set<number>;
  showOriginalDoc: Set<number>;
  toggleExpand: (index: number) => void;
  toggleOriginalDoc: (index: number) => void;
  onTryAgain: () => void;
  getEsRequestJson: () => string;
}

export function ResultsDisplay({
  searchState,
  isHybridMode,
  topK,
  enableProfiling,
  queryText,
  queryVector,
  showEsRequest,
  setShowEsRequest,
  expandedResults,
  showOriginalDoc,
  toggleExpand,
  toggleOriginalDoc,
  onTryAgain,
  getEsRequestJson,
}: ResultsDisplayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Success Header */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          <div>
            <p className="text-emerald-400 font-semibold">Search Completed</p>
            <p className="text-gray-400 text-sm">
              {isHybridMode ? (
                <>
                  Text results: {searchState.textResults || 0} • Vector results: {searchState.vectorResults || 0}
                  • Fused: {searchState.results.length}
                </>
              ) : (
                <>Found {searchState.totalHits} candidates • Top {searchState.results.length} results</>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{searchState.latency}</p>
          <p className="text-gray-500 text-xs">Query Latency</p>
        </div>
      </div>

      {/* Query Info */}
      {(queryVector || (isHybridMode && queryText)) && (
        <div className="grid md:grid-cols-2 gap-4">
          {queryVector && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-primary" />
                <p className="text-sm font-mono text-gray-400">Query Vector (first 10 of {queryVector.length} dimensions)</p>
              </div>
              <div className="bg-black/50 rounded-lg p-3 font-mono text-xs">
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                  {queryVector.slice(0, 10).map((val: number, i: number) => (
                    <span key={i} className="text-accent">{val.toFixed(4)}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isHybridMode && queryText && (
            <div className="p-4 rounded-lg bg-accent/5 border border-accent/10">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-accent" />
                <p className="text-sm font-mono text-gray-400">Query Text</p>
              </div>
              <div className="bg-black/50 rounded-lg p-3 text-sm text-gray-300">
                "{queryText}"
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timing Display */}
      {enableProfiling && searchState.timing && (
        <div className="p-4 rounded-lg bg-accent/5 border border-accent/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <p className="text-sm font-mono text-gray-400">Performance Profiling</p>
            </div>
            <span className="text-xs font-mono text-gray-500">Elasticsearch Lance Plugin</span>
          </div>

          <div className="space-y-2">
            {Object.entries(searchState.timing)
              .filter(([key]) => key !== 'total_query_ms')
              .sort(([, a], [, b]) => (typeof b === 'number' ? b : 0) - (typeof a === 'number' ? a : 0))
              .map(([key, value]) => {
                const timeMs = typeof value === 'number' ? value : 0;
                const maxValue = Math.max(
                  ...Object.values(searchState.timing || {})
                    .filter((v): v is number => typeof v === 'number')
                );
                const percentage = maxValue > 0 ? (timeMs / maxValue) * 100 : 0;
                const displayName = key
                  .replace('lance_', '')
                  .replace('_ms', '')
                  .split('_')
                  .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');

                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-gray-300">{displayName}</span>
                      <span className="font-mono text-accent">{timeMs}ms</span>
                    </div>
                    <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-accent/60 to-accent"
                      />
                    </div>
                  </div>
                );
              })}
          </div>

          {searchState.timing.total_query_ms && (
            <div className="mt-4 pt-3 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-gray-400">Total Query Time</span>
                <span className="text-lg font-bold font-mono text-accent">
                  {typeof searchState.timing.total_query_ms === 'number'
                    ? searchState.timing.total_query_ms
                    : searchState.timing.total_query_ms}ms
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Waterfall Timeline for Hybrid */}
      {isHybridMode && searchState.timingBreakdown && searchState.timingBreakdown.length > 0 && (
        <WaterfallTimeline
          timingBreakdown={searchState.timingBreakdown}
          totalLatency={searchState.latency}
        />
      )}

      {/* Show ES Request */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowEsRequest(!showEsRequest)}
          className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
        >
          <Code className="w-4 h-4" />
          {showEsRequest ? 'Hide ES Request' : 'Show ES Request'}
        </button>
      </div>

      {showEsRequest && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 rounded-lg bg-black/50 border border-gray-700"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-mono text-gray-400">Elasticsearch Request JSON</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(getEsRequestJson());
              }}
              className="text-xs text-primary hover:text-primary-light"
            >
              Copy
            </button>
          </div>
          <pre className="bg-black/80 rounded p-4 text-xs text-green-400 overflow-x-auto">
            {getEsRequestJson()}
          </pre>
        </motion.div>
      )}

      {/* Results List */}
      <div className="space-y-3">
        {searchState.results.map((result: any, index: number) => (
          <div key={result.id} className="border border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary-light font-bold text-sm">{index + 1}</span>
                </div>
                <div>
                  <p className="text-white font-semibold font-mono">{result.id}</p>
                  <p className="text-gray-500 text-sm">{result.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-accent-light font-semibold font-mono">
                    {result.score.toFixed(4)}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {result.match_type ? result.match_type.toUpperCase() : 'SCORE'}
                  </p>
                </div>
                <button
                  onClick={() => toggleExpand(index)}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-sm text-xs font-mono text-primary flex items-center gap-2 transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  {expandedResults.has(index) ? 'HIDE VECTOR' : 'SHOW VECTOR'}
                </button>
                <button
                  onClick={() => toggleOriginalDoc(index)}
                  className="px-3 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-sm text-xs font-mono text-accent flex items-center gap-2 transition-colors"
                >
                  {showOriginalDoc.has(index) ? (
                    <>
                      <FileText className="w-3 h-3" />
                      HIDE DOC
                    </>
                  ) : (
                    <>
                      <Database className="w-3 h-3" />
                      SHOW DOC
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Expanded content */}
            {(expandedResults.has(index) || showOriginalDoc.has(index)) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="border-t border-gray-700 bg-black/30"
              >
                {expandedResults.has(index) && result.vector && (
                  <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-4 h-4 text-primary" />
                      <p className="text-sm font-mono text-gray-400">Vector Data ({result.vector.length} dimensions)</p>
                    </div>
                    <div className="bg-black/50 rounded-lg p-4 font-mono text-xs">
                      <div className="grid grid-cols-8 md:grid-cols-16 gap-2">
                        {result.vector.map((val: number, i: number) => (
                          <span key={i} className="text-primary-light">{val.toFixed(3)}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {showOriginalDoc.has(index) && (
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Database className="w-4 h-4 text-accent" />
                      <p className="text-sm font-mono text-gray-400">Original Document</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-mono text-gray-500 mb-1">Primary Key (_id)</p>
                        <p className="text-sm text-white font-mono bg-black/50 rounded px-3 py-2">{result.id}</p>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-gray-500 mb-1">Category</p>
                        <p className="text-sm text-gray-300">{result.category}</p>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-gray-500 mb-1">Text Content</p>
                        <p className="text-sm text-gray-300">{result.text || 'No text content available'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* Metadata */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10">
        <p className="text-gray-400 text-sm">
          <span className="text-gray-300">Search:</span> {isHybridMode ? 'Hybrid (Text + Vector Fusion)' : 'kNN Search'}
          <span className="mx-2">•</span>
          <span className="text-gray-300">Dataset:</span> {searchState.datasetName || "dataset"}
          <span className="mx-2">•</span>
          <span className="text-gray-300">Dimensions:</span> {searchState.queryDimension}
          <span className="mx-2">•</span>
          <span className="text-gray-300">Total vectors:</span> {searchState.vectorsCount || searchState.totalHits}
          <span className="mx-2">•</span>
          <span className="text-gray-300">Top-K:</span> {topK}
          <span className="mx-2">•</span>
          <span className="text-gray-300">Similarity:</span> Cosine (normalized)
          {enableProfiling && (
            <>
              <span className="mx-2">•</span>
              <span className="text-accent">Profiling Enabled</span>
            </>
          )}
        </p>
      </div>

      {/* Try Again */}
      <div className="flex justify-center">
        <button
          onClick={onTryAgain}
          className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
        >
          <RotateCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </motion.div>
  );
}
