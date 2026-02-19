/**
 * Live Demo Feature - Main Orchestrator
 *
 * Refactored from components/live-demo.tsx (1155 lines) into feature-sliced design:
 * - Delegates to child UI components
 * - Uses entities/search/api for direct ES interaction
 * - Manages overall state and coordination
 * - Allows selection of dataset for search operations
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { slideUp } from "@/shared/lib/animations";
import {
  ACTIVE_DATASET_CHANGED_EVENT,
  DATASET_CATALOG_CHANGED_EVENT,
  type ActiveDatasetChangedDetail,
  type DatasetCatalogChangedDetail,
} from "@/lib/dataset-events";
import { generateEmbedding } from "@/entities/search";
import { SearchControls } from "./search-controls";
import { ResultsDisplay } from "./results-display";
import { ConfirmModal } from "./confirm-modal";
import { Database, ChevronDown, RefreshCw as RefreshIcon, Zap, RotateCw, AlertCircle, Settings2 } from "lucide-react";

interface Dataset {
  name: string;
  vectors: number;
  dims: number;
  size: string;
  lastModified: string;
  shardCount?: number;
  shardingStrategy?: 'NONE' | 'ES_ROUTING';
  shardPath?: string;
  datasetName?: string;
  uriPrefix?: string;
  // Compatibility fields from snake_case APIs
  shard_count?: number;
  sharding_strategy?: 'NONE' | 'ES_ROUTING';
  shard_path?: string;
  dataset_name?: string;
  uri_prefix?: string;
}

interface SearchState {
  results: any[];
  latency?: string;
  totalHits?: number;
  queryDimension?: number;
  queryVector?: number[];
  queryText?: string;
  datasetName?: string;
  vectorsCount?: number;
  timing?: any;
  textResults?: number;
  vectorResults?: number;
  fusionResults?: number;
  timingBreakdown?: any[];
  esProfile?: any;
  evidence?: any;
  traceId?: string;
  traceDebug?: any;
}

export function LiveDemo() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Dataset selection state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [showDatasetDropdown, setShowDatasetDropdown] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const prevDatasetRef = useRef<string | null>(null);

  // Search configuration
  const [isHybridMode, setIsHybridMode] = useState(false);
  const [topK, setTopK] = useState(5);
  const [enableProfiling, setEnableProfiling] = useState(true);
  const [queryText, setQueryText] = useState('machine learning');
  const [useExistingVector, setUseExistingVector] = useState(false);
  const [lastQueryVector, setLastQueryVector] = useState<number[] | null>(null);
  const [nprobes, setNprobes] = useState(20);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterField, setFilterField] = useState('category');
  const [filterValue, setFilterValue] = useState('ai');
  const [refreshState, setRefreshState] = useState<'fresh' | 'stale' | 'unknown'>('unknown');

  // NRT capability state
  const [nrtStats, setNrtStats] = useState<Record<string, any> | null>(null);
  const [nrtError, setNrtError] = useState<string | null>(null);
  const [isNrtLoading, setIsNrtLoading] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState('1s');

  // UI state
  const [showEsRequest, setShowEsRequest] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [showOriginalDoc, setShowOriginalDoc] = useState<Set<number>>(new Set());
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Load datasets on mount with retry for Next.js hydration
  useEffect(() => {
    // Initial load
    loadDatasets();

    // Retry after a short delay to handle hydration timing issues
    const retryTimer = setTimeout(() => {
      if (datasets.length === 0) {
        loadDatasets();
      }
    }, 1000);

    return () => clearTimeout(retryTimer);
  }, []);

  // Refresh dataset dropdown when Vector Management generates/deletes datasets.
  useEffect(() => {
    const handleDatasetCatalogChanged = (event: Event) => {
      const detail = (event as CustomEvent<DatasetCatalogChangedDetail>).detail;
      void loadDatasetsWithRetry(detail?.datasetName);
    };

    window.addEventListener(DATASET_CATALOG_CHANGED_EVENT, handleDatasetCatalogChanged);
    return () => {
      window.removeEventListener(DATASET_CATALOG_CHANGED_EVENT, handleDatasetCatalogChanged);
    };
  }, []);

  useEffect(() => {
    const handleActiveDatasetChanged = (event: Event) => {
      const detail = (event as CustomEvent<ActiveDatasetChangedDetail>).detail;
      if (!detail?.datasetName) {
        return;
      }
      setSelectedDataset(detail.datasetName);
      setShowDatasetDropdown(false);
      void loadDatasetsWithRetry(detail.datasetName);
    };

    window.addEventListener(ACTIVE_DATASET_CHANGED_EVENT, handleActiveDatasetChanged);
    return () => {
      window.removeEventListener(ACTIVE_DATASET_CHANGED_EVENT, handleActiveDatasetChanged);
    };
  }, []);

  // Auto-select first dataset when datasets change
  useEffect(() => {
    if (datasets.length > 0 && !selectedDataset) {
      setSelectedDataset(datasets[0].name);
    } else if (datasets.length === 0) {
      setSelectedDataset(null);
    } else if (selectedDataset && !datasets.find(d => d.name === selectedDataset)) {
      // Selected dataset was deleted, select first available
      setSelectedDataset(datasets[0]?.name || null);
    }
  }, [datasets, selectedDataset]);

  // Backfill selected dataset into lance-validation-test when user selects it.
  // Backfill is now IDEMPOTENT: if dataset is already indexed, route returns immediately.
  // This allows instant switching between previously-indexed datasets (O(1) instead of O(n)).
  useEffect(() => {
    if (selectedDataset === null) return;
    // Allow backfill on initial mount too (ensures first dataset is indexed)
    if (prevDatasetRef.current === selectedDataset) return;
    prevDatasetRef.current = selectedDataset;

    const ds = datasets.find(d => d.name === selectedDataset);
    if (!ds) return;

    setIsBackfilling(true);
    setError(null);
    setSearchState(null);

    fetch('/api/vectors/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataset: selectedDataset,
        esIndex: 'lance-validation-test',
        createIndex: true,
        // forceRecreate removed — backfill is idempotent now
        dims: ds.dims,
        shardCount: ds.shardCount || ds.shard_count || 1,
        shardingStrategy: ds.shardingStrategy || ds.sharding_strategy || 'NONE',
        shardPath: ds.shardPath || ds.shard_path,
        datasetName: ds.datasetName || ds.dataset_name,
        uriPrefix: ds.uriPrefix || ds.uri_prefix,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.success) {
          setError(`Failed to switch dataset: ${data.error}`);
        } else {
          loadNrtStats();
        }
      })
      .catch((err: any) => {
        setError(`Dataset switch failed: ${err.message}`);
      })
      .finally(() => {
        setIsBackfilling(false);
      });
  }, [selectedDataset, datasets]);

  useEffect(() => {
    if (!selectedDataset) {
      setNrtStats(null);
      setRefreshState('unknown');
      return;
    }
    loadNrtStats();
  }, [selectedDataset]);

  const loadDatasets = async (preferredDatasetName?: string): Promise<boolean> => {
    setIsLoadingDatasets(true);
    try {
      const response = await fetch('/api/vectors/list', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const normalizedDatasets: Dataset[] = (data.datasets || []).map((dataset: any) => {
            const shardCount = Number(dataset.shardCount ?? dataset.shard_count ?? 1);
            const normalizedShardCount = Number.isFinite(shardCount) && shardCount > 0 ? Math.floor(shardCount) : 1;
            const strategyRaw = String(dataset.shardingStrategy ?? dataset.sharding_strategy ?? 'NONE').toUpperCase();
            const normalizedStrategy: 'NONE' | 'ES_ROUTING' = strategyRaw === 'ES_ROUTING' ? 'ES_ROUTING' : 'NONE';

            return {
              ...dataset,
              shardCount: normalizedShardCount,
              shard_count: normalizedShardCount,
              shardingStrategy: normalizedStrategy,
              sharding_strategy: normalizedStrategy,
            };
          });
          setDatasets(normalizedDatasets);
          const preferredExists = !!preferredDatasetName && normalizedDatasets.some((dataset) => dataset.name === preferredDatasetName);
          if (preferredDatasetName && normalizedDatasets.some((dataset) => dataset.name === preferredDatasetName)) {
            setSelectedDataset(preferredDatasetName);
          }
          return preferredExists;
        }
      }
      return false;
    } catch (err) {
      console.error('Failed to load datasets:', err);
      return false;
    } finally {
      setIsLoadingDatasets(false);
    }
  };

  const loadDatasetsWithRetry = async (preferredDatasetName?: string) => {
    const targetName = preferredDatasetName?.trim();
    const maxAttempts = targetName ? 6 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const found = await loadDatasets(targetName);
      if (!targetName || found) {
        return;
      }
      await sleep(1200);
    }
  };

  const buildFilterPayload = () => {
    if (!filterEnabled || !filterValue.trim()) {
      return undefined;
    }
    return {
      term: {
        [filterField]: filterValue.trim(),
      },
    };
  };

  const loadNrtStats = async () => {
    if (!selectedDataset) return;
    setIsNrtLoading(true);
    setNrtError(null);
    try {
      const response = await fetch(`/api/lance/stats?dataset=${encodeURIComponent(selectedDataset)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load NRT stats');
      }
      setNrtStats(data);
      setRefreshState((data.refresh_state || 'unknown') as 'fresh' | 'stale' | 'unknown');
      if (data.refresh_interval) {
        setRefreshInterval(data.refresh_interval);
      }
    } catch (err: any) {
      setNrtError(err.message || 'NRT stats unavailable');
    } finally {
      setIsNrtLoading(false);
    }
  };

  const triggerManualRefresh = async () => {
    if (!selectedDataset) return;
    setIsNrtLoading(true);
    setNrtError(null);
    try {
      const response = await fetch('/api/lance/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: selectedDataset }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Manual refresh failed');
      }
      setRefreshState('fresh');
      await loadNrtStats();
    } catch (err: any) {
      setNrtError(err.message || 'Manual refresh failed');
    } finally {
      setIsNrtLoading(false);
    }
  };

  const updateRefreshConfig = async () => {
    if (!selectedDataset) return;
    setIsNrtLoading(true);
    setNrtError(null);
    try {
      const response = await fetch('/api/lance/refresh-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: selectedDataset,
          refresh_interval: refreshInterval,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update refresh interval');
      }
      if (data.refresh_interval) {
        setRefreshInterval(data.refresh_interval);
      }
      await loadNrtStats();
    } catch (err: any) {
      setNrtError(err.message || 'Failed to update refresh config');
    } finally {
      setIsNrtLoading(false);
    }
  };

  const performSearch = async () => {
    setShowConfirm(false);
    setIsLoading(true);
    setError(null);
    setSearchState(null);
    setShowEsRequest(false);

    const startTime = Date.now();

    try {
      const selectedProfile = datasets.find((d) => d.name === selectedDataset);
      const effectiveShardingStrategy = selectedProfile?.shardingStrategy || selectedProfile?.sharding_strategy;
      const filterPayload = buildFilterPayload();

      let queryVector = lastQueryVector;

      // Generate new vector if needed
      if (!useExistingVector || !queryVector) {
        if (isHybridMode && queryText) {
          queryVector = await generateEmbedding(queryText);
        } else {
          // Generate random normalized vector (768 dims to match Jina embeddings)
          const dims = 768;
          const vector = Array.from({ length: dims }, () => Math.random() * 2 - 1);
          const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
          queryVector = vector.map(v => v / magnitude);
        }
        setLastQueryVector(queryVector);
      }

      let result;
      if (isHybridMode) {
        // Use the hybrid search API which handles:
        // - Embedding generation (Jina API) with timing
        // - BM25 text search with timing
        // - Lance kNN vector search with timing
        // - RRF fusion with timing
        // Server resolves per-dataset index automatically when dataset is provided.
        const hybridResponse = await fetch('/api/search/hybrid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queryText,
            k: topK,
            numCandidates: topK * 2,
            dataset: selectedDataset,
            filter: filterPayload,
            nprobes,
            refreshState,
            shardingStrategy: effectiveShardingStrategy,
            datasetProfile: {
              shardingStrategy: effectiveShardingStrategy,
            },
          }),
        });

        if (!hybridResponse.ok) {
          throw new Error('Hybrid search request failed');
        }

        const hybridData = await hybridResponse.json();

        if (!hybridData.success) {
          throw new Error(hybridData.error || 'Hybrid search failed');
        }

        // Update last query vector for "Keep Current" option
        if (hybridData.queryVector) {
          setLastQueryVector(hybridData.queryVector);
        }

        // Extract and convert ES profile breakdown from nanoseconds to milliseconds
        let convertedTiming: Record<string, number | string> = {};
        const rawBreakdown = hybridData.esProfile?.shards?.[0]?.searches?.[0]?.query?.[0]?.breakdown;
        if (rawBreakdown) {
          for (const [key, value] of Object.entries(rawBreakdown)) {
            if (typeof value === 'number') {
              // Convert nanoseconds to milliseconds
              convertedTiming[key] = Math.round(value / 1_000_000);
            }
          }
          // Also add query type and total time
          const query = hybridData.esProfile?.shards?.[0]?.searches?.[0]?.query?.[0];
          if (query?.type) {
            convertedTiming['query_type'] = query.type;
          }
          if (query?.time_in_nanos) {
            convertedTiming['total_query_ms'] = Math.round(query.time_in_nanos / 1_000_000);
          }
        }

        result = {
          results: hybridData.results || [],
          latency: hybridData.latency || `${Date.now() - startTime}ms`,
          totalHits: (hybridData.textResults || 0) + (hybridData.vectorResults || 0),
          queryDimension: hybridData.queryVector?.length || 768,
          queryVector: hybridData.queryVector,
          queryText: hybridData.queryText,
          textResults: hybridData.textResults || 0,
          vectorResults: hybridData.vectorResults || 0,
          vectorsCount: hybridData.vectorResults || 0,
          timingBreakdown: hybridData.timingBreakdown || [],
          timing: convertedTiming,
          esProfile: hybridData.esProfile,
          evidence: hybridData.evidence,
          traceId: hybridData.traceId,
          traceDebug: hybridData.traceDebug,
        };
      } else {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queryVector,
            k: topK,
            numCandidates: topK * 2,
            profile: enableProfiling,
            dataset: selectedDataset,
            filter: filterPayload,
            nprobes,
            refreshState,
            shardingStrategy: effectiveShardingStrategy,
            datasetProfile: {
              shardingStrategy: effectiveShardingStrategy,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Search request failed');
        }

        const data = await response.json();

        result = {
          results: data.results || [],
          latency: data.latency || `${Date.now() - startTime}ms`,
          totalHits: data.totalHits || 0,
          queryDimension: data.queryDimension || queryVector.length,
          queryVector,
          datasetName: data.datasetName || selectedDataset || undefined,
          vectorsCount: data.vectorsCount || 0,
          timing: data.timing,
          evidence: data.evidence,
          traceId: data.traceId,
          traceDebug: data.traceDebug,
        };
      }

      setSearchState(result);
    } catch (err: any) {
      setError(err.message || "Search failed");
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

  const getEsRequestJson = () => {
    if (!searchState || !searchState.queryVector) return '';

    const filterPayload = buildFilterPayload();
    const vectorQuery = {
      lance_knn: {
        field: "embedding",
        query_vector: searchState.queryVector,
        k: topK,
        num_candidates: topK * 2,
        nprobes,
      }
    };

    const wrappedVectorQuery = filterPayload
      ? {
          bool: {
            must: [vectorQuery],
            filter: [filterPayload],
          },
        }
      : vectorQuery;

    if (isHybridMode && searchState.queryText) {
      const textBody = {
        query: filterPayload
          ? {
              bool: {
                must: [{ match: { text: searchState.queryText } }],
                filter: [filterPayload],
              },
            }
          : { match: { text: searchState.queryText } },
        size: topK * 2,
        _source: ["id", "category", "text"],
      };

      const vectorBody = {
        profile: enableProfiling,
        query: wrappedVectorQuery,
        size: topK,
        _source: ["id", "category", "text"],
      };

      return `// Hybrid Search - Text Query (BM25):\n${JSON.stringify(textBody, null, 2)}\n\n// Hybrid Search - Vector Query (Lance kNN):\n${JSON.stringify(vectorBody, null, 2)}`;
    }

    const queryBody = {
      profile: enableProfiling,
      query: wrappedVectorQuery,
      size: topK,
      _source: ["category", "text"],
    };

    return JSON.stringify(queryBody, null, 2);
  };

  return (
    <section id="live-demo" className="py-20 relative">
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
            <span className="text-gray-500 text-sm">Direct ES connection • Lance plugin • RRF fusion</span>
          </p>
        </motion.div>

        {/* Dataset Selector */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-2xl mx-auto mb-8 relative z-[100]"
        >
          <div className="glass-card p-4 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-white text-sm font-semibold">Search Dataset</p>
                  <p className="text-gray-400 text-xs">
                    {selectedDataset
                      ? (() => {
                          const active = datasets.find(d => d.name === selectedDataset);
                          const vectors = active?.vectors || 0;
                          const shards = active?.shardCount || active?.shard_count || 1;
                          const strategy = active?.shardingStrategy || active?.sharding_strategy || 'NONE';
                          return `${selectedDataset} (${vectors} vectors • shards=${shards} • ${strategy})`;
                        })()
                      : 'No dataset selected'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadDatasets}
                  disabled={isLoadingDatasets}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Refresh datasets"
                >
                  <RefreshIcon className={`w-4 h-4 text-gray-400 ${isLoadingDatasets ? 'animate-spin' : ''}`} />
                </button>
                {datasets.length > 0 && (
                  <div className="relative z-[100]">
                    <button
                      onClick={() => setShowDatasetDropdown(!showDatasetDropdown)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                    >
                      <span className="text-white text-sm">
                        {selectedDataset || 'Select dataset...'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDatasetDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showDatasetDropdown && (
                      <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-[200] max-h-64 overflow-y-auto">
                        {datasets.map((dataset) => (
                          <button
                            key={dataset.name}
                            onClick={() => {
                              setSelectedDataset(dataset.name);
                              setShowDatasetDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-gray-800 last:border-0 ${
                              selectedDataset === dataset.name ? 'bg-primary/20' : ''
                            }`}
                          >
                            <div className="text-white text-sm font-mono truncate">{dataset.name}</div>
                            <div className="text-gray-400 text-xs">
                              {dataset.vectors} vectors • {dataset.dims} dims • shards={dataset.shardCount || dataset.shard_count || 1} • {dataset.shardingStrategy || dataset.sharding_strategy || 'NONE'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {datasets.length === 0 && !isLoadingDatasets && (
              <p className="text-yellow-400 text-xs mt-2">
                ⚠ No datasets available. Generate a dataset in "Manage Lance Datasets" section above.
              </p>
            )}
            {isBackfilling && (
              <p className="text-blue-400 text-xs mt-2 flex items-center gap-1">
                <RefreshIcon className="w-3 h-3 animate-spin" /> Switching to {selectedDataset}… indexing documents…
              </p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-4xl mx-auto mb-6"
        >
          <div className="glass-card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-white text-sm font-semibold flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  近实时控制 (NRT)
                </p>
                <p className="text-gray-400 text-xs">
                  stats / manual refresh / refresh interval
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={loadNrtStats}
                  disabled={!selectedDataset || isNrtLoading}
                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-mono text-white disabled:opacity-50"
                >
                  {isNrtLoading ? 'Loading...' : 'Load Stats'}
                </button>
                <button
                  onClick={triggerManualRefresh}
                  disabled={!selectedDataset || isNrtLoading}
                  className="px-3 py-1.5 rounded bg-primary/20 hover:bg-primary/30 border border-primary/30 text-xs font-mono text-primary-light disabled:opacity-50"
                >
                  Manual Refresh
                </button>
              </div>
            </div>

            <div className="mt-3 grid md:grid-cols-4 gap-2">
              <div className="rounded border border-gray-700/80 bg-black/40 px-3 py-2">
                <p className="text-[10px] font-mono text-gray-500">REFRESH STATE</p>
                <p className="text-xs font-mono text-white mt-1">{refreshState}</p>
              </div>
              <div className="rounded border border-gray-700/80 bg-black/40 px-3 py-2">
                <p className="text-[10px] font-mono text-gray-500">DOCS</p>
                <p className="text-xs font-mono text-white mt-1">{nrtStats?.docs_count ?? '-'}</p>
              </div>
              <div className="rounded border border-gray-700/80 bg-black/40 px-3 py-2">
                <p className="text-[10px] font-mono text-gray-500">SHARDS</p>
                <p className="text-xs font-mono text-white mt-1">{nrtStats?.shard_count ?? '-'}</p>
              </div>
              <div className="rounded border border-gray-700/80 bg-black/40 px-3 py-2">
                <p className="text-[10px] font-mono text-gray-500">REFRESH TOTAL</p>
                <p className="text-xs font-mono text-white mt-1">{nrtStats?.refresh_total ?? '-'}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <label className="text-xs font-mono text-gray-400">refresh_interval</label>
              <input
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                disabled={!selectedDataset || isNrtLoading}
                className="w-28 bg-black/50 border border-gray-600 rounded px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-primary disabled:opacity-50"
              />
              <button
                onClick={updateRefreshConfig}
                disabled={!selectedDataset || isNrtLoading}
                className="px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 border border-accent/30 text-xs font-mono text-accent-light disabled:opacity-50"
              >
                Save Config
              </button>
            </div>

            {nrtError && (
              <p className="text-red-300 text-xs mt-2">{nrtError}</p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-4xl mx-auto relative z-10"
        >
          <div className="glass-card p-8">
            <SearchControls
              isHybridMode={isHybridMode}
              setIsHybridMode={setIsHybridMode}
              topK={topK}
              setTopK={setTopK}
              queryText={queryText}
              setQueryText={setQueryText}
              enableProfiling={enableProfiling}
              setEnableProfiling={setEnableProfiling}
              useExistingVector={useExistingVector}
              setUseExistingVector={setUseExistingVector}
              hasLastVector={lastQueryVector !== null}
              isLoading={isLoading || isBackfilling}
              onSearchClick={() => setShowConfirm(true)}
              nprobes={nprobes}
              setNprobes={setNprobes}
              filterEnabled={filterEnabled}
              setFilterEnabled={setFilterEnabled}
              filterField={filterField}
              setFilterField={setFilterField}
              filterValue={filterValue}
              setFilterValue={setFilterValue}
            />

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

            {searchState && !showConfirm && (
              <ResultsDisplay
                searchState={searchState}
                isHybridMode={isHybridMode}
                topK={topK}
                enableProfiling={enableProfiling}
                queryText={queryText}
                queryVector={searchState.queryVector}
                showEsRequest={showEsRequest}
                setShowEsRequest={setShowEsRequest}
                expandedResults={expandedResults}
                showOriginalDoc={showOriginalDoc}
                toggleExpand={toggleExpand}
                toggleOriginalDoc={toggleOriginalDoc}
                onTryAgain={() => setShowConfirm(true)}
                getEsRequestJson={getEsRequestJson}
                traceId={searchState.traceId}
              />
            )}
          </div>
        </motion.div>
      </div>

      {showConfirm && (
        <ConfirmModal
          isHybridMode={isHybridMode}
          topK={topK}
          queryText={queryText}
          useExistingVector={useExistingVector}
          hasLastVector={lastQueryVector !== null}
          enableProfiling={enableProfiling}
          datasetName={searchState?.datasetName}
          vectorsCount={searchState?.vectorsCount}
          queryDimension={searchState?.queryDimension}
          onConfirm={performSearch}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </section>
  );
}
