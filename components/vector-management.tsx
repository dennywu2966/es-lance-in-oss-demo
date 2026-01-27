"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  RefreshCw,
  Database,
  HardDrive,
  Calendar,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Download,
  Eye,
  X,
  FileText,
  Clock,
  Tag,
  Upload,
} from "lucide-react";
import { slideUp, staggerContainer } from "@/lib/animations";

interface Dataset {
  name: string;
  vectors: number;
  dims: number;
  size: string;
  lastModified: string;
}

interface GenerateResponse {
  success: boolean;
  dataset?: string;
  vectors: number;
  dims: number;
  error?: string;
  uploadTime?: number;
}

interface SampledVector {
  id: string;
  vector: number[];
  category: string;
}

interface SampleResponse {
  success: boolean;
  samples?: SampledVector[];
  total?: number;
  error?: string;
}

interface Document {
  id: string;
  title: string;
  text: string;
  topic: string;
  created_at: string;
}

interface DocumentsResponse {
  success: boolean;
  documents?: Document[];
  total?: number;
  error?: string;
}

export function VectorManagement() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSampling, setIsSampling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sampled vectors state
  const [sampledVectors, setSampledVectors] = useState<SampledVector[] | null>(null);
  const [sampledDataset, setSampledDataset] = useState<string | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

  // Backfill state
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Generation parameters
  const [vectors, setVectors] = useState(100);
  const [dims, setDims] = useState(128);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [additionalVectors, setAdditionalVectors] = useState(50);

  // Load datasets on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/vectors/list");
      const data = await res.json();

      if (data.success) {
        setDatasets(data.datasets);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const generateDataset = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/vectors/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vectors, dims }),
      });

      const data: GenerateResponse = await res.json();

      if (data.success) {
        setSuccess(
          `Generated ${data.vectors} vectors (${data.dims} dims) in ${data.uploadTime}ms`
        );
        await loadDatasets(); // Refresh list
      } else {
        setError(data.error || "Generation failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateDataset = async (additionalVectors: number) => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      if (datasets.length === 0) {
        setError("No dataset found to update");
        return;
      }

      const dataset = datasets[0];

      const res = await fetch("/api/vectors/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset: dataset.name,
          additionalVectors,
          dims: dataset.dims,
        }),
      });

      const data: GenerateResponse = await res.json();

      if (data.success) {
        setSuccess(
          `Updated dataset with ${data.vectors} total vectors (${data.dims} dims) in ${data.uploadTime}ms`
        );
        setShowUpdateModal(false);
        await loadDatasets(); // Refresh list
      } else {
        setError(data.error || "Update failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteDataset = async (datasetName: string) => {
    if (!confirm(`Delete dataset "${datasetName}"?`)) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/vectors/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: datasetName }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`Dataset "${datasetName}" deleted`);
        await loadDatasets(); // Refresh list
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const sampleVectors = async (datasetName: string) => {
    setIsSampling(true);
    setError(null);
    setSuccess(null);
    setSampledVectors(null);
    setSampledDataset(null);

    try {
      const res = await fetch("/api/vectors/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: datasetName, count: 10 }),
      });

      const data: SampleResponse = await res.json();

      if (data.success && data.samples) {
        setSampledVectors(data.samples);
        setSampledDataset(datasetName);
        setSuccess(`Sampled ${data.samples.length} vectors from ${data.total} total vectors`);
      } else {
        setError(data.error || "Sampling failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSampling(false);
    }
  };

  const loadDocuments = async () => {
    setIsLoadingDocuments(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/vectors/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });

      const data: DocumentsResponse = await res.json();

      if (data.success && data.documents) {
        setDocuments(data.documents);
        setSuccess(`Loaded ${data.documents.length} documents from ${data.total} total`);
      } else {
        setError(data.error || "Failed to load documents");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const backfillToElasticsearch = async () => {
    setIsBackfilling(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/vectors/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (data.success) {
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

  return (
    <section className="py-20 relative">
      {/* Background with grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-10" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={slideUp}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-sm font-mono mb-6">
            <Database className="w-4 h-4" />
            VECTOR MANAGEMENT SYSTEM
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-4 font-mono">
            <span className="text-white">DATASET</span>
            <span className="text-primary">.CONTROL</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto font-mono">
            Generate, manage, and deploy Lance vector datasets to Alibaba Cloud OSS
          </p>
        </motion.div>

        {/* Main Control Panel */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-6xl mx-auto space-y-8"
        >
          {/* Generator Panel */}
          <motion.div variants={slideUp} className="relative">
            {/* Corner decorations */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/50" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary/50" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary/50" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary/50" />

            <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-sm p-8">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="ml-4 font-mono text-sm text-gray-400">
                    generate_vectors.sh
                  </span>
                </div>
                <div className="flex items-center gap-2 text-primary animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs font-mono">OSS CONNECTED</span>
                </div>
              </div>

              {/* Parameter inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Vectors input */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-mono text-gray-300">
                    <Activity className="w-4 h-4 text-primary" />
                    VECTOR_COUNT
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={vectors}
                      onChange={(e) => setVectors(parseInt(e.target.value) || 100)}
                      min={10}
                      max={10000}
                      className="w-full bg-black/50 border border-gray-600 rounded-sm px-4 py-3 text-white font-mono focus:outline-none focus:border-primary transition-colors"
                      disabled={isGenerating}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">
                      [10-10000]
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                    <Zap className="w-3 h-3" />
                    <span>Memory: ~{(vectors * dims * 4 / 1024).toFixed(0)} KB</span>
                  </div>
                </div>

                {/* Dimensions input */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-mono text-gray-300">
                    <Database className="w-4 h-4 text-accent" />
                    DIMENSIONS
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={dims}
                      onChange={(e) => setDims(parseInt(e.target.value) || 10)}
                      min={2}
                      max={4096}
                      className="w-full bg-black/50 border border-gray-600 rounded-sm px-4 py-3 text-white font-mono focus:outline-none focus:border-accent transition-colors"
                      disabled={isGenerating}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">
                      [2-4096]
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                    <HardDrive className="w-3 h-3" />
                    <span>Total: {(vectors * dims).toLocaleString()} values</span>
                  </div>
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={generateDataset}
                disabled={isGenerating || datasets.length > 0}
                className="w-full relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 transition-opacity group-hover:opacity-100" />
                <div className="relative px-8 py-4 border-2 border-primary/50 group-hover:border-primary transition-colors">
                  <div className="flex items-center justify-center gap-3">
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                        <span className="text-white font-mono">GENERATING...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5 text-primary" />
                        <span className="text-white font-mono">GENERATE & UPLOAD DATASET</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              {datasets.length > 0 && !isGenerating && (
                <div className="mt-2 text-center text-xs font-mono text-gray-500">
                  Maximum 1 dataset allowed. Delete existing dataset to create a new one.
                </div>
              )}
            </div>
          </motion.div>

          {/* Update Modal */}
          <AnimatePresence>
            {showUpdateModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                onClick={() => setShowUpdateModal(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-md w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-2xl font-bold text-white mb-4">Add More Vectors</h3>
                  <p className="text-gray-400 mb-6">
                    Add {additionalVectors} more vectors to the existing dataset ({datasets[0]?.vectors || 0} vectors)
                  </p>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-mono text-gray-300 mb-2">
                        <Database className="w-4 h-4 text-accent" />
                        ADDITIONAL VECTORS
                      </label>
                      <input
                        type="number"
                        value={additionalVectors}
                        onChange={(e) => setAdditionalVectors(parseInt(e.target.value) || 10)}
                        min={10}
                        max={10000}
                        className="w-full bg-black/50 border border-gray-600 rounded px-4 py-3 text-white font-mono focus:outline-none focus:border-accent transition-colors"
                        disabled={isGenerating}
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                      <Zap className="w-3 h-3" />
                      <span>Current: {datasets[0]?.vectors || 0} vectors</span>
                      <span>→</span>
                      <span>New total: {(datasets[0]?.vectors || 0) + additionalVectors} vectors</span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => updateDataset(additionalVectors)}
                      disabled={isGenerating}
                      className="flex-1 px-6 py-3 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          UPDATING...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          ADD VECTORS
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowUpdateModal(false)}
                      disabled={isGenerating}
                      className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      CANCEL
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alerts */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-red-500/10 border border-red-500/30 rounded-sm p-4"
              >
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-mono text-sm">ERROR</p>
                    <p className="text-gray-300 text-sm mt-1">{error}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-4"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-emerald-400 font-mono text-sm">SUCCESS</p>
                    <p className="text-gray-300 text-sm mt-1">{success}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Datasets List */}
          <motion.div variants={slideUp} className="relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold font-mono text-white">
                  <span className="text-primary">/</span> DATASETS
                </h3>
                <span className="px-2 py-1 bg-primary/20 border border-primary/30 text-primary text-xs font-mono rounded">
                  {datasets.length}
                </span>
              </div>
              <button
                onClick={loadDatasets}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-sm text-sm font-mono text-gray-300 flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                REFRESH
              </button>
            </div>

            {/* Table */}
            <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-sm overflow-hidden">
              {datasets.length === 0 ? (
                <div className="p-12 text-center">
                  <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 font-mono">NO DATASETS FOUND</p>
                  <p className="text-gray-600 text-sm mt-2">Generate your first dataset above</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700 bg-black/30">
                        <th className="px-6 py-4 text-left font-mono text-xs text-gray-400 font-medium">
                          DATASET_NAME
                        </th>
                        <th className="px-6 py-4 text-left font-mono text-xs text-gray-400 font-medium">
                          VECTORS
                        </th>
                        <th className="px-6 py-4 text-left font-mono text-xs text-gray-400 font-medium">
                          DIMS
                        </th>
                        <th className="px-6 py-4 text-left font-mono text-xs text-gray-400 font-medium">
                          SIZE
                        </th>
                        <th className="px-6 py-4 text-left font-mono text-xs text-gray-400 font-medium">
                          CREATED
                        </th>
                        <th className="px-6 py-4 text-right font-mono text-xs text-gray-400 font-medium">
                          ACTIONS
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasets.map((dataset, index) => (
                        <tr
                          key={dataset.name}
                          className="border-b border-gray-800 hover:bg-primary/5 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: `hsl(${(index * 60) % 360}, 70%, 60%)`,
                                }}
                              />
                              <span className="font-mono text-sm text-gray-200">
                                {dataset.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm text-primary">
                              {dataset.vectors.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm text-accent">
                              {dataset.dims}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm text-gray-400">
                              {dataset.size}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-gray-400">
                              <Calendar className="w-3 h-3" />
                              <span className="font-mono text-xs">
                                {new Date(dataset.lastModified).toLocaleDateString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setShowUpdateModal(true)}
                                disabled={isGenerating || isSampling}
                                className="px-3 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-sm text-xs font-mono text-accent flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                <Plus className="w-3 h-3" />
                                ADD VECTORS
                              </button>
                              <button
                                onClick={() => sampleVectors(dataset.name)}
                                disabled={isSampling || isGenerating}
                                className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-sm text-xs font-mono text-primary flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                {isSampling && sampledDataset === dataset.name ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                                SAMPLE
                              </button>
                              <button
                                onClick={loadDocuments}
                                disabled={isLoadingDocuments || isGenerating || isSampling}
                                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-sm text-xs font-mono text-emerald-400 flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                {isLoadingDocuments ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FileText className="w-3 h-3" />
                                )}
                                DOCUMENTS
                              </button>
                              <button
                                onClick={backfillToElasticsearch}
                                disabled={isBackfilling || isGenerating || isSampling || isLoadingDocuments}
                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-sm text-xs font-mono text-blue-400 flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                {isBackfilling ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Upload className="w-3 h-3" />
                                )}
                                BACKFILL ES
                              </button>
                              <button
                                onClick={() => deleteDataset(dataset.name)}
                                disabled={isGenerating || isSampling}
                                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-sm text-xs font-mono text-red-400 flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                DELETE
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>

          {/* Sampled Vectors Display */}
          <AnimatePresence>
            {sampledVectors && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                variants={slideUp}
                className="relative"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-bold font-mono text-white">
                      <span className="text-accent">/</span> SAMPLED_VECTORS
                    </h3>
                    <span className="px-2 py-1 bg-accent/20 border border-accent/30 text-accent text-xs font-mono rounded">
                      {sampledVectors.length} samples
                    </span>
                    <span className="text-sm font-mono text-gray-400">
                      from: {sampledDataset}
                    </span>
                  </div>
                  <button
                    onClick={() => setSampledVectors(null)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-sm text-sm font-mono text-gray-300 flex items-center gap-2 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    CLOSE
                  </button>
                </div>

                {/* Vectors Grid */}
                <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-sm p-6">
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {sampledVectors.map((sample, index) => (
                      <div key={sample.id} className="border border-gray-700 rounded-sm overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-black/30 border-b border-gray-700">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                              <span className="text-accent font-bold text-xs">{index + 1}</span>
                            </div>
                            <div>
                              <p className="text-white font-mono text-sm">{sample.id}</p>
                              <p className="text-gray-500 text-xs font-mono">{sample.vector.length} dimensions</p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-mono rounded">
                            {sample.category}
                          </span>
                        </div>

                        {/* Vector Values */}
                        <div className="p-4 bg-black/20">
                          <div className="bg-black/50 rounded p-3 font-mono text-xs">
                            <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-16 gap-2">
                              {sample.vector.slice(0, 32).map((val, i) => (
                                <span key={i} className="text-primary">
                                  {val.toFixed(4)}
                                </span>
                              ))}
                              {sample.vector.length > 32 && (
                                <span className="text-gray-500 col-span-full">
                                  ... and {sample.vector.length - 32} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Documents Display */}
          <AnimatePresence>
            {documents && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                variants={slideUp}
                className="relative"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-bold font-mono text-white">
                      <span className="text-emerald-400">/</span> DOCUMENTS
                    </h3>
                    <span className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono rounded">
                      {documents.length} docs
                    </span>
                  </div>
                  <button
                    onClick={() => setDocuments(null)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-sm text-sm font-mono text-gray-300 flex items-center gap-2 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    CLOSE
                  </button>
                </div>

                {/* Documents Grid */}
                <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-sm p-6">
                  <div className="space-y-4 max-h-[800px] overflow-y-auto">
                    {documents.map((doc, index) => (
                      <div key={doc.id} className="border border-gray-700 rounded-sm overflow-hidden hover:border-emerald-500/30 transition-colors">
                        {/* Document Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-black/30 border-b border-gray-700">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-emerald-400 font-bold text-sm">{index + 1}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-white font-mono text-sm font-semibold truncate">{doc.title}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-gray-500 text-xs font-mono flex items-center gap-1">
                                  <Tag className="w-3 h-3" />
                                  {doc.topic}
                                </span>
                                <span className="text-gray-600 text-xs font-mono flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(doc.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-gray-800 border border-gray-600 text-gray-400 text-xs font-mono rounded ml-2 flex-shrink-0">
                            {doc.id}
                          </span>
                        </div>

                        {/* Document Text */}
                        <div className="p-4 bg-black/20">
                          <div className="bg-black/50 rounded-sm p-4">
                            <p className="text-gray-300 text-sm leading-relaxed font-mono">
                              {doc.text}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
