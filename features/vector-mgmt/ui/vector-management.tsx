/**
 * Vector Management Feature - Main Component
 *
 * Refactored from components/vector-management.tsx to use:
 * - Python backend for dataset generation (via SSE streaming)
 * - Direct ES interaction for search
 * - Feature-sliced design
 *
 * RESTORED FEATURES:
 * - View uploaded documents (with primary key, text, vectors)
 * - Backfill documents to Elasticsearch for Lance vectors
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, Trash2, RefreshCw, Plus, Upload, CheckCircle2, AlertCircle, FileText, X, Tag } from "lucide-react";
import { slideUp } from "@/shared/lib/animations";
import { dispatchActiveDatasetChanged, dispatchDatasetCatalogChanged } from "@/lib/dataset-events";
import { listDatasets, generateDataset, appendDataset, deleteDataset, subscribeToJobProgress, type Dataset } from "../api/dataset-client";
import { estimateRemainingSeconds, formatRemainingTime } from "../lib/progress-estimate";

interface Document {
  _id: string;
  id: string;
  title: string;
  text: string;
  topic: string;
  category: string;
}

interface DocumentsResponse {
  success: boolean;
  documents?: Document[];
  total?: number;
  error?: string;
}

interface BackfillResponse {
  success: boolean;
  indexedDocuments?: number;
  totalDocuments?: number;
  duration?: string;
  esIndex?: string;
  message?: string;
  error?: string;
}

export function VectorManagement() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Generation state
  const [vectors, setVectors] = useState(50);
  const [dims, setDims] = useState(128);
  const [shardCount, setShardCount] = useState(1);
  const [shardingStrategy, setShardingStrategy] = useState<'NONE' | 'ES_ROUTING'>('NONE');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showAppendModal, setShowAppendModal] = useState(false);
  const [appendVectors, setAppendVectors] = useState(10);
  const [appendTargetShard, setAppendTargetShard] = useState<string>('auto');

  // Job progress state
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [estimatedRemainingSec, setEstimatedRemainingSec] = useState<number | null>(null);
  const [appendJobId, setAppendJobId] = useState<string | null>(null);
  const [appendProgress, setAppendProgress] = useState(0);
  const [appendStatus, setAppendStatus] = useState<string>("");
  const [appendProgressMessage, setAppendProgressMessage] = useState<string>("");
  const [appendEstimatedRemainingSec, setAppendEstimatedRemainingSec] = useState<number | null>(null);
  const [isAppending, setIsAppending] = useState(false);

  // Documents viewer state
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);

  // Backfill state
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Selected dataset state
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [pendingGeneratedDataset, setPendingGeneratedDataset] = useState<string | null>(null);
  const activeSelectionSourceRef = useRef<"vector-management" | "live-demo">("vector-management");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const selectDataset = (datasetName: string | null, source: "vector-management" | "live-demo" = "vector-management") => {
    activeSelectionSourceRef.current = source;
    setSelectedDataset((prev) => (prev === datasetName ? prev : datasetName));
  };

  // Load datasets on mount
  useEffect(() => {
    void loadDatasets();
  }, []);

  // Auto-select first dataset when datasets change
  useEffect(() => {
    if (datasets.length > 0 && !selectedDataset) {
      selectDataset(datasets[0].name);
    } else if (datasets.length === 0) {
      selectDataset(null);
    } else if (selectedDataset && !datasets.find(d => d.name === selectedDataset)) {
      // Selected dataset was deleted, select first available
      selectDataset(datasets[0]?.name || null);
    }
  }, [datasets, selectedDataset]);

  useEffect(() => {
    if (!pendingGeneratedDataset) {
      return;
    }
    const exists = datasets.some((dataset) => dataset.name === pendingGeneratedDataset);
    if (exists) {
      selectDataset(pendingGeneratedDataset);
      setPendingGeneratedDataset(null);
    }
  }, [datasets, pendingGeneratedDataset]);

  useEffect(() => {
    if (!selectedDataset) {
      return;
    }
    dispatchActiveDatasetChanged({
      datasetName: selectedDataset,
      source: activeSelectionSourceRef.current,
    });
  }, [selectedDataset]);

  useEffect(() => {
    setAppendTargetShard("auto");
  }, [selectedDataset]);

  const loadDatasets = async (): Promise<Dataset[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listDatasets();
      const nextDatasets = result.datasets || [];
      setDatasets(nextDatasets);
      return nextDatasets;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDatasetsUntilVisible = async (datasetName?: string | null): Promise<Dataset[]> => {
    const targetName = datasetName?.trim();
    const maxAttempts = targetName ? 6 : 1;
    let latestDatasets: Dataset[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      latestDatasets = await loadDatasets();
      if (!targetName || latestDatasets.some((dataset) => dataset.name === targetName)) {
        return latestDatasets;
      }
      await sleep(1200);
    }

    return latestDatasets;
  };

  const handleGenerate = async () => {
    setShowGenerateModal(false);
    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    setProgress(0);
    setJobStatus("");
    setProgressMessage("Preparing generation job...");
    const startedAtMs = Date.now();
    setEstimatedRemainingSec(null);

    try {
      // Start generation
      const result = await generateDataset({
        vectors,
        dims,
        shard_count: shardCount,
        sharding_strategy: shardingStrategy,
      });
      setJobId(result.job_id);
      setJobStatus("running");

      // Subscribe to progress
      const cleanup = subscribeToJobProgress(result.job_id, {
        onProgress: (prog, status, message) => {
          setProgress(prog);
          setJobStatus(status);
          if (message) setProgressMessage(message);
          const remaining = estimateRemainingSeconds({
            startedAtMs,
            nowMs: Date.now(),
            progressPercent: prog,
          });
          setEstimatedRemainingSec(remaining);
        },
        onComplete: (data) => {
          setProgress(100);
          setJobStatus("completed");
          const createdDatasetName = data?.dataset_name;
          setProgressMessage("Dataset generation completed");
          setEstimatedRemainingSec(0);
          setPendingGeneratedDataset(createdDatasetName || null);
          setSuccess(
            `Dataset generated: ${data.dataset_name} (${data.vectors} vectors, ${data.dims} dims, shards=${shardCount}, strategy=${shardingStrategy})`
          );
          setIsGenerating(false);
          void refreshDatasetsUntilVisible(createdDatasetName).then((latestDatasets) => {
            if (createdDatasetName && latestDatasets.some((dataset) => dataset.name === createdDatasetName)) {
              selectDataset(createdDatasetName);
              setPendingGeneratedDataset(null);
            }
          }).finally(() => {
            dispatchDatasetCatalogChanged({
              reason: "generated",
              datasetName: createdDatasetName,
            });
          });
        },
        onError: (err) => {
          setJobStatus("failed");
          setError(err);
          setEstimatedRemainingSec(null);
          setIsGenerating(false);
        },
      });

      // Cleanup on unmount
      return cleanup;
    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
    }
  };

  const handleDelete = async (datasetName: string) => {
    if (!confirm(`Delete dataset "${datasetName}"?`)) return;

    setIsLoading(true);
    setError(null);
    try {
      await deleteDataset(datasetName);
      setSuccess(`Deleted dataset: ${datasetName}`);
      await loadDatasets();
      dispatchDatasetCatalogChanged({ reason: "deleted", datasetName });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Load documents from dataset (Sample Documents)
  const handleLoadDocuments = async (datasetName: string) => {
    setIsLoadingDocuments(true);
    setError(null);
    setSuccess(null);
    setShowDocuments(false);

    try {
      const res = await fetch("/api/vectors/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: datasetName, limit: 10 }),
      });

      const data: DocumentsResponse = await res.json();

      if (data.success && data.documents) {
        setDocuments(data.documents);
        setSuccess(`Sampled ${data.documents.length} documents from ${data.total} total`);
        setShowDocuments(true);
      } else {
        setError(data.error || "Failed to load documents");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  // Backfill documents to Elasticsearch
  const backfillDataset = async (targetDataset: string): Promise<BackfillResponse> => {
    const selectedProfile = datasets.find((d) => d.name === targetDataset);
    const resolvedShardCount = selectedProfile?.shard_count || 1;
    const resolvedStrategy = selectedProfile?.sharding_strategy || 'NONE';
    const resolvedDims = selectedProfile?.dims || 768;
    const resolvedShardPath = selectedProfile?.shard_path;
    const resolvedDatasetName = selectedProfile?.dataset_name;
    const resolvedUriPrefix = selectedProfile?.uri_prefix;

    const res = await fetch("/api/vectors/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: targetDataset,
        dims: resolvedDims,
        shardCount: resolvedShardCount,
        shardingStrategy: resolvedStrategy,
        shardPath: resolvedShardPath,
        datasetName: resolvedDatasetName,
        uriPrefix: resolvedUriPrefix,
      }),
    });

    return await res.json();
  };

  const refreshLanceNrt = async (targetDataset: string): Promise<void> => {
    try {
      await fetch("/api/lance/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: targetDataset }),
      });
    } catch {
      // Keep append flow resilient even when refresh endpoint is unavailable.
    }
  };

  const handleBackfill = async (datasetName?: string) => {
    setIsBackfilling(true);
    setError(null);
    setSuccess(null);

    try {
      const targetDataset = datasetName || selectedDataset;
      if (!targetDataset) {
        setError("No dataset selected to backfill");
        return;
      }

      const data = await backfillDataset(targetDataset);
      if (data.success) {
        await refreshLanceNrt(targetDataset);
        setSuccess(data.message || `Backfilled ${data.indexedDocuments} documents to Elasticsearch in ${data.duration}`);
      } else {
        setError(data.error || "Backfill failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleAppend = async () => {
    const targetDataset = selectedDataset;
    if (!targetDataset) {
      setError("Select a dataset before appending vectors");
      return;
    }

    let targetShardId: number | undefined;
    if (appendTargetShard !== 'auto') {
      const parsed = Number.parseInt(appendTargetShard, 10);
      if (Number.isFinite(parsed)) {
        targetShardId = parsed;
      }
    }

    setShowAppendModal(false);
    setIsAppending(true);
    setError(null);
    setSuccess(null);
    setAppendProgress(0);
    setAppendStatus("");
    setAppendProgressMessage("Preparing append job...");
    const startedAtMs = Date.now();
    setAppendEstimatedRemainingSec(null);

    try {
      const result = await appendDataset({
        dataset: targetDataset,
        vectors: appendVectors,
        target_shard_id: targetShardId,
      });

      setAppendJobId(result.job_id);
      setAppendStatus("running");

      const cleanup = subscribeToJobProgress(result.job_id, {
        onProgress: (prog, status, message) => {
          setAppendProgress(prog);
          setAppendStatus(status);
          if (message) setAppendProgressMessage(message);
          const remaining = estimateRemainingSeconds({
            startedAtMs,
            nowMs: Date.now(),
            progressPercent: prog,
          });
          setAppendEstimatedRemainingSec(remaining);
        },
        onComplete: (data) => {
          void (async () => {
            const updatedDatasetName = data?.dataset_name || targetDataset;
            const appended = Number(data?.appended_vectors || appendVectors);
            setAppendProgress(100);
            setAppendStatus("completed");
            setAppendProgressMessage("Append completed. Syncing Elasticsearch index...");
            setAppendEstimatedRemainingSec(0);
            setIsBackfilling(true);

            const backfillResponse = await backfillDataset(updatedDatasetName);
            if (!backfillResponse.success) {
              throw new Error(backfillResponse.error || "Backfill after append failed");
            }
            await refreshLanceNrt(updatedDatasetName);

            await refreshDatasetsUntilVisible(updatedDatasetName);
            selectDataset(updatedDatasetName);
            dispatchDatasetCatalogChanged({
              reason: "updated",
              datasetName: updatedDatasetName,
            });

            setSuccess(
              `Appended ${appended} vectors to ${updatedDatasetName} and synchronized Elasticsearch index`
            );
            setIsBackfilling(false);
            setIsAppending(false);
          })().catch((err: any) => {
            setError(err.message || "Append completed but synchronization failed");
            setIsBackfilling(false);
            setIsAppending(false);
          });
        },
        onError: (err) => {
          setAppendStatus("failed");
          setError(err);
          setAppendEstimatedRemainingSec(null);
          setIsAppending(false);
        },
      });

      return cleanup;
    } catch (err: any) {
      setError(err.message);
      setIsAppending(false);
    }
  };

  const selectedDatasetProfile = selectedDataset
    ? datasets.find((dataset) => dataset.name === selectedDataset)
    : undefined;
  const selectedDatasetShardCount = selectedDatasetProfile?.shard_count || 1;

  return (
    <section id="vector-management" className="py-20 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={slideUp}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-sm font-medium mb-6">
            <Database className="w-4 h-4" />
            Vector Management
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Manage Lance Datasets</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Generate, view, and deploy Lance datasets with Elasticsearch integration
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="flex justify-center gap-4 mb-8 flex-wrap"
        >
          <button
            onClick={loadDatasets}
            disabled={isLoading}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={isGenerating}
            className="px-6 py-3 bg-primary hover:bg-primary-dark disabled:bg-gray-700 text-white rounded-lg transition-all flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {isGenerating ? 'Generating...' : 'Generate Dataset'}
          </button>
          <button
            onClick={() => setShowAppendModal(true)}
            disabled={isAppending || !selectedDataset}
            className="px-6 py-3 bg-accent/20 hover:bg-accent/30 disabled:bg-gray-700 text-white rounded-lg transition-all flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {isAppending ? 'Appending...' : 'Append Vectors'}
          </button>
          {datasets.length > 0 && selectedDataset && (
            <>
              <button
                onClick={() => handleBackfill()}
                disabled={isBackfilling || isGenerating}
                className="px-6 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {isBackfilling ? 'Backfilling...' : 'Backfill to ES'}
              </button>
              <button
                onClick={() => handleLoadDocuments(selectedDataset)}
                disabled={isLoadingDocuments || isGenerating}
                className="px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {isLoadingDocuments ? 'Loading...' : 'Sample Documents'}
              </button>
            </>
          )}
        </motion.div>

        {/* Generation Progress */}
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-8 p-6 rounded-lg bg-primary/5 border border-primary/20"
          >
            <div className="flex items-center gap-3 mb-4">
              <Upload className="w-5 h-5 text-primary animate-bounce" />
              <div className="flex-1">
                <p className="text-white font-semibold">Generating Dataset...</p>
                <p className="text-gray-400 text-sm">{jobStatus} • {progress.toFixed(1)}%</p>
                <p className="text-gray-500 text-xs mt-1">
                  ETA: {formatRemainingTime(estimatedRemainingSec)}
                </p>
                {progressMessage && (
                  <p className="text-gray-500 text-xs mt-1">{progressMessage}</p>
                )}
              </div>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-gradient-to-r from-primary to-accent"
              />
            </div>
          </motion.div>
        )}

        {/* Append Progress */}
        {isAppending && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-8 p-6 rounded-lg bg-accent/10 border border-accent/30"
          >
            <div className="flex items-center gap-3 mb-4">
              <Plus className="w-5 h-5 text-accent animate-pulse" />
              <div className="flex-1">
                <p className="text-white font-semibold">Appending Vectors...</p>
                <p className="text-gray-400 text-sm">{appendStatus} • {appendProgress.toFixed(1)}%</p>
                <p className="text-gray-500 text-xs mt-1">
                  ETA: {formatRemainingTime(appendEstimatedRemainingSec)}
                </p>
                {appendProgressMessage && (
                  <p className="text-gray-500 text-xs mt-1">{appendProgressMessage}</p>
                )}
                {appendJobId && (
                  <p className="text-gray-600 text-xs mt-1 font-mono">job: {appendJobId}</p>
                )}
              </div>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${appendProgress}%` }}
                transition={{ duration: 0.25 }}
                className="h-full bg-gradient-to-r from-accent to-primary"
              />
            </div>
          </motion.div>
        )}

        {/* Backfill Progress */}
        {isBackfilling && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-8 p-6 rounded-lg bg-blue-500/10 border border-blue-500/20"
          >
            <div className="flex items-center gap-3 mb-4">
              <Upload className="w-5 h-5 text-blue-400 animate-bounce" />
              <div className="flex-1">
                <p className="text-white font-semibold">Backfilling to Elasticsearch...</p>
                <p className="text-gray-400 text-sm">Indexing documents with lance_vector field</p>
              </div>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
              />
            </div>
          </motion.div>
        )}

        {/* Status Messages */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-8 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-8 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <p className="text-emerald-400">{success}</p>
          </motion.div>
        )}

        {/* Dataset List */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideUp}
          className="max-w-4xl mx-auto"
        >
          {datasets.length === 0 ? (
            <div className="text-center py-12">
              <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No datasets found. Generate your first dataset to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {datasets.map((dataset) => {
                const isSelected = selectedDataset === dataset.name;
                return (
                  <div
                    key={dataset.name}
                    className={`glass-card p-6 cursor-pointer transition-all ${
                      isSelected
                        ? 'ring-2 ring-primary border-primary/50'
                        : 'hover:border-gray-600'
                    }`}
                    onClick={() => selectDataset(dataset.name)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          isSelected ? 'bg-primary/30' : 'bg-primary/20'
                        }`}>
                          <Database className={`w-6 h-6 ${isSelected ? 'text-primary-light' : 'text-primary'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-mono font-semibold">{dataset.name}</p>
                            {isSelected && (
                              <span className="px-2 py-0.5 bg-primary/20 border border-primary/30 text-primary text-xs rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm">
                            {dataset.vectors} vectors • {dataset.dims} dims • {dataset.size}
                            {` • shards=${dataset.shard_count || 1} • ${dataset.sharding_strategy || 'NONE'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectDataset(dataset.name);
                            }}
                            className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg transition-colors flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Select
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(dataset.name);
                          }}
                          disabled={isLoading || isGenerating}
                          className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Additional Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-700">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadDocuments(dataset.name);
                        }}
                        disabled={isLoadingDocuments || isGenerating}
                        className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
                      >
                        <FileText className="w-4 h-4" />
                        Sample Documents
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBackfill(dataset.name);
                        }}
                        disabled={isBackfilling || isGenerating}
                        className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
                      >
                        <Upload className="w-4 h-4" />
                        Backfill to ES
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Documents Modal */}
        <AnimatePresence>
          {showDocuments && documents && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] p-4 overflow-y-auto"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="max-w-4xl mx-auto my-8 relative z-[101]"
              >
                <div className="modal-panel rounded-lg overflow-hidden shadow-2xl">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <div>
                      <h3 className="text-2xl font-bold text-white">Sampled Documents</h3>
                      <p className="text-gray-400 text-sm mt-1">
                        Showing {documents.length} documents with all fields (max 10)
                      </p>
                    </div>
                    <button
                      onClick={() => setShowDocuments(false)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Documents List */}
                  <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                    {documents.map((doc, index) => (
                      <div key={doc.id} className="bg-black/30 border border-gray-700 rounded-lg overflow-hidden">
                        {/* Document Header */}
                        <div className="p-4 border-b border-gray-700">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-1 bg-primary/20 border border-primary/30 text-primary text-xs font-mono rounded">
                                  #{index + 1}
                                </span>
                                <span className="px-2 py-1 bg-gray-800 border border-gray-600 text-gray-400 text-xs font-mono rounded">
                                  ID: {doc.id}
                                </span>
                                <span className="px-2 py-1 bg-gray-800 border border-gray-600 text-gray-400 text-xs font-mono rounded">
                                  PK: {doc._id}
                                </span>
                              </div>
                              <h4 className="text-white font-semibold text-lg">{doc.title}</h4>
                            </div>
                            <span className="px-2 py-1 bg-accent/20 border border-accent/30 text-accent text-xs font-mono rounded">
                              {doc.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Tag className="w-3 h-3 text-gray-500" />
                            <span className="text-gray-500 text-xs font-mono">{doc.topic}</span>
                          </div>
                        </div>

                        {/* Document Content */}
                        <div className="p-4 bg-black/20">
                          <p className="text-gray-300 text-sm leading-relaxed font-mono whitespace-pre-wrap">
                            {doc.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generate Modal */}
        {showGenerateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="modal-panel rounded-lg p-8 max-w-md w-full"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Generate New Dataset</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-mono text-gray-300 mb-2">Number of Vectors</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={vectors}
                    onChange={(e) => setVectors(Math.min(10000, Math.max(1, parseInt(e.target.value) || 10)))}
                    className="modal-input w-full rounded px-4 py-3 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-mono text-gray-300 mb-2">Vector Dimensions</label>
                  <input
                    type="number"
                    min={64}
                    max={4096}
                    value={dims}
                    onChange={(e) => setDims(Math.min(4096, Math.max(64, parseInt(e.target.value) || 768)))}
                    className="modal-input w-full rounded px-4 py-3 font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-2">Common: 768 (Jina v2), 1536 (OpenAI)</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">分片数 (Shard Count)</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={shardCount}
                    onChange={(e) => setShardCount(Math.min(32, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="modal-input w-full rounded px-4 py-3 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">分片算法 (Sharding Strategy)</label>
                  <select
                    value={shardingStrategy}
                    onChange={(e) => setShardingStrategy((e.target.value === 'ES_ROUTING' ? 'ES_ROUTING' : 'NONE'))}
                    className="modal-input w-full rounded px-4 py-3"
                  >
                    <option value="NONE">NONE</option>
                    <option value="ES_ROUTING">ES_ROUTING</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    建议: 默认使用 NONE；数据布局与 ES 路由一致时再选择 ES_ROUTING。
                  </p>
                </div>

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                  <p className="text-blue-400 text-sm">
                    <strong>Note:</strong> Generation may take 30-60 seconds due to:
                  </p>
                  <ul className="text-gray-400 text-xs mt-2 space-y-1">
                    <li>• GLM API document generation</li>
                    <li>• Jina API embeddings generation</li>
                    <li>• Lance dataset creation with IVF-PQ indexing</li>
                    <li>• OSS upload</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={handleGenerate}
                  className="flex-1 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors font-semibold"
                >
                  Start Generation
                </button>
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Append Modal */}
        {showAppendModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="modal-panel rounded-lg p-8 max-w-md w-full"
            >
              <h3 className="text-2xl font-bold text-white mb-2">Append Vectors</h3>
              <p className="text-sm text-gray-400 mb-6">
                Add new vectors/documents to an existing dataset and synchronize Elasticsearch.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-mono text-gray-300 mb-2">Target Dataset</label>
                  <div className="modal-input w-full rounded px-4 py-3 font-mono text-sm text-white">
                    {selectedDataset || "No dataset selected"}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-mono text-gray-300 mb-2">Vectors to Append</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={appendVectors}
                    onChange={(e) => setAppendVectors(Math.min(5000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="modal-input w-full rounded px-4 py-3 font-mono"
                  />
                </div>

                {selectedDatasetShardCount > 1 && (
                  <div>
                    <label className="block text-sm font-mono text-gray-300 mb-2">Target Shard</label>
                    <select
                      value={appendTargetShard}
                      onChange={(e) => setAppendTargetShard(e.target.value)}
                      className="modal-input w-full rounded px-4 py-3"
                    >
                      <option value="auto">Auto by strategy</option>
                      {Array.from({ length: selectedDatasetShardCount }).map((_, shardId) => (
                        <option key={`append-shard-${shardId}`} value={String(shardId)}>
                          shard-{shardId}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                      For ES_ROUTING datasets, explicit shard append will generate IDs aligned to the selected shard.
                    </p>
                  </div>
                )}

                <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
                  <p className="text-accent-light text-sm">
                    <strong>Flow:</strong> append in OSS → rebuild ES metadata index → refresh for search visibility.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={handleAppend}
                  disabled={!selectedDataset || isAppending}
                  className="flex-1 px-6 py-3 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors font-semibold disabled:opacity-50"
                >
                  Start Append
                </button>
                <button
                  onClick={() => setShowAppendModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </section>
  );
}
