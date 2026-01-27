"use client";

import { motion } from "framer-motion";
import { Search, Zap, AlertCircle, RotateCw, CheckCircle2, ChevronDown, Activity, Eye, Database, Code, FileText, Sparkles } from "lucide-react";
import { useState } from "react";
import { slideUp } from "@/lib/animations";
import { WaterfallTimeline } from "./waterfall-timeline";

interface TimingBreakdown {
  phase: string;
  duration: number;
  startOffset: number;
}

interface SearchResult {
  id: string;
  category: string;
  text?: string;
  score: number;
  index: string;
  vector?: number[];
  matchType?: 'text' | 'vector' | 'hybrid';
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  latency: string;
  totalHits: number;
  queryDimension: number;
  queryVector?: number[];
  datasetName?: string;
  vectorsCount?: number;
  error?: string;
  timing?: { [key: string]: number | string };
  textResults?: number;
  vectorResults?: number;
  fusionResults?: number;
  queryText?: string;
  timingBreakdown?: TimingBreakdown[];
}

interface BackfillResponse {
  success: boolean;
  indexed?: number;
  failed?: number;
  error?: string;
  details?: string;
}

export function LiveDemo() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [topK, setTopK] = useState(5);

  // New states for vector selection and profiling
  const [useExistingVector, setUseExistingVector] = useState(false);
  const [lastQueryVector, setLastQueryVector] = useState<number[] | null>(null);
  const [enableProfiling, setEnableProfiling] = useState(true);
  const [showTiming, setShowTiming] = useState(false);

  // New states for backfill, hybrid search, and UI enhancements
  const [backfillResponse, setBackfillResponse] = useState<BackfillResponse | null>(null);
  const [isHybridMode, setIsHybridMode] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [showOriginalDoc, setShowOriginalDoc] = useState<Set<number>>(new Set());
  const [showEsRequest, setShowEsRequest] = useState(false);
  const [esRequestJson, setEsRequestJson] = useState<string>('');

  // Custom query editor states
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [customQueryError, setCustomQueryError] = useState<string | null>(null);
  const [customResponse, setCustomResponse] = useState<any>(null);

  const performSearch = async (isHybrid: boolean = false) => {
    setShowConfirm(false);
    setIsLoading(true);
    setError(null);
    setResponse(null);
    setShowTiming(false);
    setShowEsRequest(false);

    try {
      const endpoint = isHybrid ? '/api/search/hybrid' : '/api/search';
      const requestBody: any = {
        k: topK,
        numCandidates: topK * 2,
        profile: enableProfiling,
        useExistingVector: useExistingVector && lastQueryVector !== null,
      };

      // Add existing vector if keeping
      if (useExistingVector && lastQueryVector) {
        requestBody.queryVector = lastQueryVector;
      }

      // Add text query for hybrid search
      if (isHybrid && queryText) {
        requestBody.queryText = queryText;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data: SearchResponse = await res.json();

      if (data.success) {
        setResponse(data);
        // Save the query vector for next search
        if (data.queryVector) {
          setLastQueryVector(data.queryVector);
        }
        setShowTiming(enableProfiling && data.timing !== undefined);
      } else {
        setError(data.error || "Search failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to search service");
    } finally {
      setIsLoading(false);
    }
  };

  const performBackfill = async () => {
    setIsLoading(true);
    setError(null);
    setBackfillResponse(null);

    try {
      const dataset = response?.datasetName;
      if (!dataset) {
        setError("No dataset available. Please perform a search first.");
        setIsLoading(false);
        return;
      }

      const res = await fetch("/api/vectors/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset }),
      });

      const data: BackfillResponse = await res.json();

      if (data.success) {
        setBackfillResponse(data);
      } else {
        setError(data.error || "Backfill failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to backfill documents");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedResults((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleOriginalDoc = (index: number) => {
    setShowOriginalDoc((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const performCustomQuery = async () => {
    setIsLoading(true);
    setCustomQueryError(null);
    setCustomResponse(null);

    try {
      // Validate JSON
      let parsedQuery;
      try {
        parsedQuery = JSON.parse(customQuery);
      } catch (err) {
        setCustomQueryError('Invalid JSON format');
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/search/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: parsedQuery }),
      });

      const data = await res.json();

      if (data.success) {
        setCustomResponse(data);
      } else {
        setCustomQueryError(data.error || 'Custom query failed');
      }
    } catch (err: any) {
      setCustomQueryError(err.message || 'Failed to execute custom query');
    } finally {
      setIsLoading(false);
    }
  };

  const getEsRequestJson = () => {
    if (!response) return '';

    // For hybrid search, generate both text and vector queries
    if (isHybridMode && response.queryText) {
      const hybridBody = {
        query: {
          match: {
            text: response.queryText,
          },
        },
        size: topK * 2,
        _source: ["id", "category", "text"],
      };

      const vectorBody = {
        knn: {
          field: "embedding",
          query_vector: response.queryVector,
          k: topK,
          num_candidates: topK * 2,
        },
        size: topK,
        _source: ["id", "category", "text"],
      };

      return `// Hybrid Search - Text Query (BM25):\n${JSON.stringify(hybridBody, null, 2)}\n\n// Hybrid Search - Vector Query (kNN):\n${JSON.stringify(vectorBody, null, 2)}`;
    }

    // For kNN search, generate vector query
    if (!response.queryVector) return '';

    const queryBody = {
      profile: enableProfiling,
      knn: {
        field: "embedding",
        query_vector: response.queryVector,
        k: topK,
        num_candidates: topK * 2,
      },
      size: topK,
      _source: ["category", "text"],
    };

    return JSON.stringify(queryBody, null, 2);
  };

  return (
    <section id="live-demo" className="py-20 relative">
      {/* Background effects */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={slideUp}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Live Demo
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Try It Now</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto font-mono">
            Real kNN and hybrid search against Lance dataset with Elasticsearch
            <br />
            <span className="text-gray-500 text-sm">Cosine similarity • IVF-PQ indexed • RRF fusion</span>
          </p>
        </motion.div>

        {/* Search Interface */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-4xl mx-auto"
        >
          <div className="glass-card p-8">
            {/* Search Mode Toggle */}
            <div className="mb-6 flex items-center justify-center gap-4 flex-wrap">
              <button
                onClick={() => { setIsHybridMode(false); setIsCustomMode(false); setError(null); }}
                className={`px-6 py-3 rounded-lg font-mono text-sm transition-all ${
                  !isHybridMode && !isCustomMode
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                disabled={isLoading}
              >
                <Search className="w-4 h-4 inline mr-2" />
                kNN Search
              </button>
              <button
                onClick={() => { setIsHybridMode(true); setIsCustomMode(false); setError(null); }}
                className={`px-6 py-3 rounded-lg font-mono text-sm transition-all ${
                  isHybridMode
                    ? 'bg-gradient-to-r from-accent to-primary text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                disabled={isLoading}
              >
                <Sparkles className="w-4 h-4 inline mr-2" />
                Hybrid Search
              </button>
              <button
                onClick={() => { setIsCustomMode(true); setIsHybridMode(false); setError(null); }}
                className={`px-6 py-3 rounded-lg font-mono text-sm transition-all ${
                  isCustomMode
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                disabled={isLoading}
              >
                <Code className="w-4 h-4 inline mr-2" />
                Custom Query
              </button>
            </div>

            {/* Parameters Input */}
            <div className="mb-6 space-y-4">
              {/* Top-K Results */}
              <div className="flex items-center justify-center gap-6">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-mono text-gray-300">Top-K Results:</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={topK}
                    onChange={(e) => setTopK(Math.min(50, Math.max(1, parseInt(e.target.value) || 5)))}
                    disabled={isLoading}
                    className="w-20 bg-black/50 border border-gray-600 rounded px-3 py-2 text-white font-mono text-center focus:outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Vector Selection (kNN only) */}
              {!isHybridMode && (
                <div className="flex items-center justify-center gap-4">
                  <span className="text-sm font-mono text-gray-300">Query Vector:</span>
                  <button
                    onClick={() => setUseExistingVector(false)}
                    disabled={isLoading || lastQueryVector === null}
                    className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
                      !useExistingVector
                        ? 'bg-primary text-white shadow-lg shadow-primary/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50'
                    }`}
                  >
                    New Vector
                  </button>
                  <button
                    onClick={() => setUseExistingVector(true)}
                    disabled={isLoading || lastQueryVector === null}
                    className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
                      useExistingVector
                        ? 'bg-accent text-white shadow-lg shadow-accent/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50'
                    }`}
                  >
                    Keep Current
                  </button>
                  {lastQueryVector === null && (
                    <span className="text-xs text-gray-500 font-mono">(First search always uses new vector)</span>
                  )}
                </div>
              )}

              {/* Hybrid Search - Query Text Input */}
              {isHybridMode && (
                <div className="flex items-center justify-center gap-4">
                  <label className="text-sm font-mono text-gray-300">Query Text:</label>
                  <input
                    type="text"
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    disabled={isLoading}
                    placeholder="Enter search text..."
                    className="flex-1 max-w-md bg-black/50 border border-gray-600 rounded px-4 py-2 text-white font-mono focus:outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
              )}

              {/* Custom Query Editor */}
              {isCustomMode && (
                <div className="space-y-3">
                  <div className="text-center">
                    <label className="text-sm font-mono text-gray-300">Elasticsearch Query JSON:</label>
                    <p className="text-xs text-gray-500 mt-1">Write and execute custom Elasticsearch queries</p>
                  </div>
                  <textarea
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    disabled={isLoading}
                    placeholder='{\n  "query": {\n    "match": {\n      "text": "search query"\n    }\n  },\n  "size": 10\n}'
                    className="w-full h-64 bg-black/50 border border-gray-600 rounded px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50 resize-y"
                  />
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setCustomQuery(JSON.stringify({
                        query: {
                          match: {
                            text: "machine learning"
                          }
                        },
                        size: 10
                      }, null, 2))}
                      disabled={isLoading}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                    >
                      Load Example: Match
                    </button>
                    <button
                      onClick={() => setCustomQuery(JSON.stringify({
                        knn: {
                          field: "embedding",
                          query_vector: new Array(768).fill(0).map(() => Math.random()),
                          k: 5,
                          num_candidates: 10
                        },
                        size: 5
                      }, null, 2))}
                      disabled={isLoading}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                    >
                      Load Example: kNN
                    </button>
                    <button
                      onClick={() => setCustomQuery(JSON.stringify({
                        query: {
                          bool: {
                            must: [
                              { match: { text: "search" } }
                            ],
                            filter: [
                              { term: { category: "databases" } }
                            ]
                          }
                        },
                        size: 10
                      }, null, 2))}
                      disabled={isLoading}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                    >
                      Load Example: Bool
                    </button>
                  </div>
                </div>
              )}

              {/* Profiling Toggle (hide in custom mode) */}
              {!isCustomMode && (
                <div className="flex items-center justify-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableProfiling}
                      onChange={(e) => setEnableProfiling(e.target.checked)}
                      disabled={isLoading}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    <span className="ml-3 text-sm font-mono text-gray-300">Enable Profiling</span>
                  </label>
                  <span className="text-xs text-gray-500">(Shows timing breakdown)</span>
                </div>
              )}
            </div>

            {/* Search Button */}
            {!isCustomMode ? (
              <div className="flex justify-center mb-8">
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={isLoading}
                  className="group relative px-8 py-4 bg-primary hover:bg-primary-dark disabled:bg-gray-700 text-white font-semibold rounded-lg overflow-hidden transition-all duration-300 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {isLoading ? (
                      <>
                        <RotateCw className="w-5 h-5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        {isHybridMode ? (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Execute Hybrid Search
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            Execute kNN Search
                          </>
                        )}
                      </>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-light to-accent-light opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            ) : (
              <div className="flex justify-center mb-8">
                <button
                  onClick={performCustomQuery}
                  disabled={isLoading || !customQuery.trim()}
                  className="group relative px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:bg-gray-700 text-white font-semibold rounded-lg overflow-hidden transition-all duration-300 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {isLoading ? (
                      <>
                        <RotateCw className="w-5 h-5 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Code className="w-5 h-5" />
                        Execute Custom Query
                      </>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8"
              >
                <div className="inline-flex items-center gap-3 text-gray-400 font-mono text-sm">
                  <RotateCw className="w-6 h-6 animate-spin text-primary" />
                  <span>Executing {isHybridMode ? 'hybrid' : 'kNN'} search...</span>
                </div>
              </motion.div>
            )}

            {/* Error State */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-semibold">Search Failed</p>
                    <p className="text-gray-400 text-sm mt-1">{error}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Custom Query Error State */}
            {customQueryError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-semibold">Custom Query Failed</p>
                    <p className="text-gray-400 text-sm mt-1">{customQueryError}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Results */}
            {response && !showConfirm && (
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
                            Text results: {response.textResults || 0} • Vector results: {response.vectorResults || 0}
                            • Fused: {response.results.length}
                          </>
                        ) : (
                          <>Found {response.totalHits} candidates • Top {response.results.length} results</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{response.latency}</p>
                    <p className="text-gray-500 text-xs">Query Latency</p>
                  </div>
                </div>

                {/* Query Info Display */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Query Vector Display */}
                  {response.queryVector && (
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-4 h-4 text-primary" />
                        <p className="text-sm font-mono text-gray-400">Query Vector (first 10 of {response.queryDimension} dimensions)</p>
                      </div>
                      <div className="bg-black/50 rounded-lg p-3 font-mono text-xs">
                        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                          {response.queryVector.slice(0, 10).map((val, i) => (
                            <span key={i} className="text-accent">{val.toFixed(4)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Query Text Display (Hybrid only) */}
                  {isHybridMode && response.queryText && (
                    <div className="p-4 rounded-lg bg-accent/5 border border-accent/10">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-accent" />
                        <p className="text-sm font-mono text-gray-400">Query Text</p>
                      </div>
                      <div className="bg-black/50 rounded-lg p-3 text-sm text-gray-300">
                        "{response.queryText}"
                      </div>
                    </div>
                  )}
                </div>

                {/* Timing Breakdown Visualization */}
                {showTiming && response.timing && (
                  <div className="p-4 rounded-lg bg-accent/5 border border-accent/10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-accent" />
                        <p className="text-sm font-mono text-gray-400">Performance Profiling</p>
                      </div>
                      <span className="text-xs font-mono text-gray-500">Elasticsearch Lance Plugin</span>
                    </div>

                    {/* Timing Bars */}
                    <div className="space-y-2">
                      {Object.entries(response.timing)
                        .filter(([key]) => key !== 'total_query_ms')
                        .sort(([, a], [, b]) => (typeof b === 'number' ? b : 0) - (typeof a === 'number' ? a : 0))
                        .map(([key, value]) => {
                          const timeMs = typeof value === 'number' ? value : 0;
                          const maxValue = Math.max(
                            ...Object.values(response.timing || {})
                              .filter((v): v is number => typeof v === 'number')
                          );
                          const percentage = maxValue > 0 ? (timeMs / maxValue) * 100 : 0;
                          const displayName = key
                            .replace('lance_', '')
                            .replace('_ms', '')
                            .split('_')
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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

                    {/* Total Time */}
                    {response.timing.total_query_ms && (
                      <div className="mt-4 pt-3 border-t border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-gray-400">Total Query Time</span>
                          <span className="text-lg font-bold font-mono text-accent">
                            {typeof response.timing.total_query_ms === 'number'
                              ? response.timing.total_query_ms
                              : response.timing.total_query_ms}ms
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Waterfall Timeline for Hybrid Search */}
                {isHybridMode && response.timingBreakdown && response.timingBreakdown.length > 0 && (
                  <WaterfallTimeline
                    timingBreakdown={response.timingBreakdown}
                    totalLatency={response.latency}
                  />
                )}

                {/* Show ES Request Button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      setShowEsRequest(!showEsRequest);
                      if (!showEsRequest) {
                        setEsRequestJson(getEsRequestJson());
                      }
                    }}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
                  >
                    <Code className="w-4 h-4" />
                    {showEsRequest ? 'Hide ES Request' : 'Show ES Request'}
                  </button>
                </div>

                {/* ES Request JSON Display */}
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
                          navigator.clipboard.writeText(esRequestJson);
                        }}
                        className="text-xs text-primary hover:text-primary-light"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="bg-black/80 rounded p-4 text-xs text-green-400 overflow-x-auto">
                      {esRequestJson || getEsRequestJson()}
                    </pre>
                  </motion.div>
                )}

                {/* Results List */}
                <div className="space-y-3">
                  {response.results.map((result, index) => (
                    <div key={result.id} className="border border-gray-700 rounded-lg overflow-hidden">
                      {/* Main Result Row */}
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
                              {result.matchType ? result.matchType.toUpperCase() : 'SCORE'}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleExpand(index)}
                            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-sm text-xs font-mono text-primary flex items-center gap-2 transition-colors"
                          >
                            {expandedResults.has(index) ? (
                              <>
                                <Eye className="w-3 h-3" />
                                HIDE VECTOR
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3" />
                                SHOW VECTOR
                              </>
                            )}
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

                      {/* Expanded Vector Data */}
                      {expandedResults.has(index) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="border-t border-gray-700 bg-black/30"
                        >
                          <div className="p-6">
                            <div className="flex items-center gap-2 mb-4">
                              <Activity className="w-4 h-4 text-primary" />
                              <p className="text-sm font-mono text-gray-400">Vector Data ({result.vector?.length || 0} dimensions)</p>
                            </div>
                            {result.vector ? (
                              <div className="bg-black/50 rounded-lg p-4 font-mono text-xs">
                                <div className="grid grid-cols-8 md:grid-cols-16 gap-2">
                                  {result.vector.map((val, i) => (
                                    <span key={i} className="text-primary-light">{val.toFixed(3)}</span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center py-8">
                                <RotateCw className="w-5 h-5 animate-spin text-primary mr-3" />
                                <span className="text-gray-400 text-sm font-mono">Loading vector from OSS...</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* Original Document Display */}
                      {showOriginalDoc.has(index) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="border-t border-gray-700 bg-black/30"
                        >
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
                              {result.vector && (
                                <div>
                                  <p className="text-xs font-mono text-gray-500 mb-1">Vector (first 10 dims)</p>
                                  <div className="bg-black/50 rounded-lg p-3 font-mono text-xs">
                                    <div className="grid grid-cols-5 gap-2">
                                      {result.vector.slice(0, 10).map((val, i) => (
                                        <span key={i} className="text-accent">{val.toFixed(3)}</span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Backfill Section (after kNN Search) */}
                {!isHybridMode && (
                  <div className="mt-8 p-6 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <Database className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">Backfill Elasticsearch Documents</h3>
                    </div>
                    <p className="text-gray-400 text-sm mb-4">
                      Index ES documents with text fields for each Lance vector. This enables hybrid search combining BM25 text search with vector kNN.
                    </p>

                    {backfillResponse ? (
                      backfillResponse.success ? (
                        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <p className="text-emerald-400 font-semibold">Backfill Completed</p>
                          </div>
                          <p className="text-gray-400 text-sm">{backfillResponse.details}</p>
                          <div className="mt-3 flex gap-6 text-sm">
                            <p className="text-emerald-300">Indexed: {backfillResponse.indexed}</p>
                            <p className="text-red-300">Failed: {backfillResponse.failed}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                          <p className="text-red-400 font-semibold">Backfill Failed</p>
                          <p className="text-gray-400 text-sm">{backfillResponse.error}</p>
                        </div>
                      )
                    ) : (
                      <div className="flex justify-center">
                        <button
                          onClick={performBackfill}
                          disabled={isLoading}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2 font-mono"
                        >
                          <Database className="w-4 h-4" />
                          {isLoading ? 'Backfilling...' : 'Backfill ES Documents'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata */}
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-gray-400 text-sm">
                    <span className="text-gray-300">Search:</span> {isHybridMode ? 'Hybrid (Text + Vector Fusion)' : 'kNN Search'}
                    <span className="mx-2">•</span>
                    <span className="text-gray-300">Dataset:</span> {response.datasetName || "dataset"}
                    <span className="mx-2">•</span>
                    <span className="text-gray-300">Dimensions:</span> {response.queryDimension}
                    <span className="mx-2">•</span>
                    <span className="text-gray-300">Total vectors:</span> {response.vectorsCount || response.totalHits}
                    <span className="mx-2">•</span>
                    <span className="text-gray-300">Top-K:</span> {topK}
                    <span className="mx-2">•</span>
                    <span className="text-gray-300">Similarity:</span> Cosine (normalized)
                    {showTiming && (
                      <>
                        <span className="mx-2">•</span>
                        <span className="text-accent">Profiling Enabled</span>
                      </>
                    )}
                  </p>
                </div>

                {/* Try Again Button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" />
                    Try Again
                  </button>
                </div>
              </motion.div>
            )}

            {/* Custom Query Results */}
            {customResponse && !showConfirm && (
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
                      <p className="text-emerald-400 font-semibold">Custom Query Completed</p>
                      <p className="text-gray-400 text-sm">
                        Found {customResponse.totalHits || 0} total hits • Latency: {customResponse.latency || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Results Display */}
                <div className="p-4 rounded-lg bg-black/50 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-mono text-gray-400">Response JSON</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(customResponse.results, null, 2));
                      }}
                      className="text-xs text-primary hover:text-primary-light"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="bg-black/80 rounded p-4 text-xs text-green-400 overflow-x-auto max-h-96 overflow-y-auto">
                    {JSON.stringify(customResponse.results, null, 2)}
                  </pre>
                </div>

                {/* Hits List */}
                {customResponse.results?.hits?.hits && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-mono text-gray-400">Results ({customResponse.results.hits.hits.length})</h3>
                    {customResponse.results.hits.hits.map((hit: any, index: number) => (
                      <div key={hit._id} className="border border-gray-700 rounded-lg overflow-hidden">
                        <div className="p-4 bg-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                                <span className="text-purple-400 font-bold text-sm">{index + 1}</span>
                              </div>
                              <div>
                                <p className="text-white font-semibold font-mono">{hit._source?.id || hit._id}</p>
                                <p className="text-gray-500 text-sm">{hit._source?.category || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-purple-400 font-semibold font-mono">
                                {hit._score?.toFixed(4) || 'N/A'}
                              </p>
                              <p className="text-gray-500 text-xs">SCORE</p>
                            </div>
                          </div>
                          {hit._source?.text && (
                            <div className="mt-3 p-3 bg-black/30 rounded">
                              <p className="text-gray-300 text-sm">{hit._source.text}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Try Again Button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setCustomResponse(null)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" />
                    Execute Another Query
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-white mb-4">
              {isHybridMode ? 'Confirm Hybrid Search' : 'Confirm kNN Search'}
            </h3>
            <p className="text-gray-400 mb-6">
              Execute {isHybridMode ? 'hybrid (text + vector fusion)' : 'kNN'} search{enableProfiling ? ' with profiling' : ''} against live Lance dataset{useExistingVector && lastQueryVector ? ' using current query vector' : ''}?
            </p>
            <div className="bg-black/30 rounded-lg p-4 mb-6 font-mono text-sm space-y-1">
              <p className="text-gray-400">• Dataset: <span className="text-white">{response?.datasetName || "Latest available"}</span></p>
              <p className="text-gray-400">• Dataset size: <span className="text-white">{response?.vectorsCount || "N/A"} vectors, {response?.queryDimension || "N/A"} dims</span></p>

              {isHybridMode ? (
                <>
                  <p className="text-gray-400">• Query Text: <span className="text-white">"{queryText || "Not provided"}"</span></p>
                  <p className="text-gray-400">• Fusion Method: <span className="text-white">RRF (Reciprocal Rank Fusion)</span></p>
                </>
              ) : (
                <>
                  <p className="text-gray-400">• Query Vector: <span className="text-white">{useExistingVector && lastQueryVector ? "Keep Current" : "Generate New"}</span></p>
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
                onClick={() => performSearch(isHybridMode)}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors font-semibold"
              >
                Confirm & Search
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
