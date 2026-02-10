/**
 * Search Controls Component
 *
 * Handles all search parameter inputs and mode toggles
 */

"use client";

import { Search, Sparkles, Code, Zap, RotateCw } from "lucide-react";

interface SearchControlsProps {
  isHybridMode: boolean;
  setIsHybridMode: (value: boolean) => void;
  topK: number;
  setTopK: (value: number) => void;
  queryText: string;
  setQueryText: (value: string) => void;
  enableProfiling: boolean;
  setEnableProfiling: (value: boolean) => void;
  useExistingVector: boolean;
  setUseExistingVector: (value: boolean) => void;
  hasLastVector: boolean;
  isLoading: boolean;
  onSearchClick: () => void;
}

export function SearchControls({
  isHybridMode,
  setIsHybridMode,
  topK,
  setTopK,
  queryText,
  setQueryText,
  enableProfiling,
  setEnableProfiling,
  useExistingVector,
  setUseExistingVector,
  hasLastVector,
  isLoading,
  onSearchClick,
}: SearchControlsProps) {
  return (
    <>
      {/* Search Mode Toggle */}
      <div className="mb-6 flex items-center justify-center gap-4 flex-wrap">
        <button
          onClick={() => setIsHybridMode(false)}
          className={`px-6 py-3 rounded-lg font-mono text-sm transition-all ${
            !isHybridMode
              ? 'bg-primary text-white shadow-lg shadow-primary/30'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
          disabled={isLoading}
        >
          <Search className="w-4 h-4 inline mr-2" />
          kNN Search
        </button>
        <button
          onClick={() => setIsHybridMode(true)}
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
      </div>

      {/* Parameters */}
      <div className="mb-6 space-y-4">
        {/* Top-K */}
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
              disabled={isLoading || !hasLastVector}
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
              disabled={isLoading || !hasLastVector}
              className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
                useExistingVector
                  ? 'bg-accent text-white shadow-lg shadow-accent/30'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50'
              }`}
            >
              Keep Current
            </button>
            {!hasLastVector && (
              <span className="text-xs text-gray-500 font-mono">(First search always uses new vector)</span>
            )}
          </div>
        )}

        {/* Query Text (Hybrid only) */}
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

        {/* Profiling Toggle */}
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
      </div>

      {/* Search Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={onSearchClick}
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
    </>
  );
}
