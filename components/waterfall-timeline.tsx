"use client";

import { motion } from "framer-motion";
import { Clock, Zap } from "lucide-react";

interface TimingBreakdown {
  phase: string;
  duration: number;
  startOffset: number;
}

interface WaterfallTimelineProps {
  timingBreakdown: TimingBreakdown[];
  totalLatency: string;
}

const phaseColors: { [key: string]: string } = {
  'Embedding Generation': 'from-purple-500 to-purple-600',
  'Text Search (BM25)': 'from-blue-500 to-blue-600',
  'Vector Search (kNN)': 'from-emerald-500 to-emerald-600',
  'RRF Fusion': 'from-pink-500 to-pink-600',
};

const phaseIcons: { [key: string]: string } = {
  'Embedding Generation': '🧠',
  'Text Search (BM25)': '📝',
  'Vector Search (kNN)': '🎯',
  'RRF Fusion': '🔗',
};

export function WaterfallTimeline({ timingBreakdown, totalLatency }: WaterfallTimelineProps) {
  if (!timingBreakdown || timingBreakdown.length === 0) {
    return null;
  }

  const totalDuration = timingBreakdown.reduce((sum, phase) => Math.max(sum, phase.startOffset + phase.duration), 0);

  return (
    <div className="glass-card p-6 mt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-accent-light" />
          <h3 className="text-lg font-semibold gradient-text">Performance Timeline</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-gray-400">Total: </span>
          <span className="text-accent-light font-mono font-semibold">{totalLatency}</span>
        </div>
      </div>

      {/* Waterfall visualization */}
      <div className="space-y-4">
        {/* Time axis */}
        <div className="relative h-8 mb-4">
          <div className="absolute inset-0 flex items-end justify-between text-xs text-gray-500 font-mono">
            <span>0ms</span>
            <span>{Math.round(totalDuration / 4)}ms</span>
            <span>{Math.round(totalDuration / 2)}ms</span>
            <span>{Math.round((totalDuration * 3) / 4)}ms</span>
            <span>{Math.round(totalDuration)}ms</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
        </div>

        {/* Timeline bars */}
        <div className="space-y-3">
          {timingBreakdown.map((phase, index) => {
            const startPercent = (phase.startOffset / totalDuration) * 100;
            const widthPercent = Math.max((phase.duration / totalDuration) * 100, 1);
            const colorClass = phaseColors[phase.phase] || 'from-gray-500 to-gray-600';
            const icon = phaseIcons[phase.phase] || '⚡';

            return (
              <motion.div
                key={phase.phase}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {/* Phase label */}
                <div className="flex items-center justify-between mb-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="text-gray-300 font-medium">{phase.phase}</span>
                  </div>
                  <span className="text-accent-light font-mono font-semibold">
                    {phase.duration > 0 ? `${phase.duration}ms` : 'N/A'}
                  </span>
                </div>

                {/* Timeline bar */}
                <div className="relative h-10 bg-gray-800/50 rounded-lg overflow-hidden">
                  {/* Background grid */}
                  <div className="absolute inset-0 flex">
                    <div className="flex-1 border-r border-gray-700/30" />
                    <div className="flex-1 border-r border-gray-700/30" />
                    <div className="flex-1 border-r border-gray-700/30" />
                    <div className="flex-1" />
                  </div>

                  {/* Phase bar */}
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                    className="absolute h-full rounded-lg bg-gradient-to-r shadow-lg"
                    style={{
                      left: `${startPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r ${colorClass} opacity-80`} />
                  </motion.div>

                  {/* Start time indicator */}
                  {phase.startOffset > 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-accent/50"
                      style={{ left: `${startPercent}%` }}
                    >
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-accent rounded-full" />
                    </div>
                  )}
                </div>

                {/* Offset label */}
                {phase.startOffset > 0 && (
                  <div className="mt-1 text-xs text-gray-500 font-mono" style={{ marginLeft: `${startPercent}%` }}>
                    +{phase.startOffset}ms
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-purple-500 to-purple-600" />
              <span>Embedding Generation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-blue-500 to-blue-600" />
              <span>Text Search (BM25)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-emerald-500 to-emerald-600" />
              <span>Vector Search (kNN)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-pink-500 to-pink-600" />
              <span>RRF Fusion</span>
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700/30">
          <div className="text-sm text-gray-400 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-light" />
              <span className="font-medium text-gray-300">Performance Insights:</span>
            </div>
            <ul className="ml-6 space-y-1 list-disc text-gray-400">
              {timingBreakdown.some(p => p.phase === 'Embedding Generation' && p.duration > 200) && (
                <li>Embedding generation adds significant latency. Consider caching frequent queries.</li>
              )}
              {timingBreakdown.some(p => p.phase === 'Vector Search (kNN)' && p.duration > 100) && (
                <li>Vector search is the bottleneck. IVF-PQ index tuning may help.</li>
              )}
              {timingBreakdown.length > 2 && (
                <li>Parallel search execution could reduce total latency by ~{Math.round(totalDuration * 0.3)}ms.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
