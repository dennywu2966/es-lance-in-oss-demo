"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, GitBranch, Clock3, Copy, Bug } from "lucide-react";

interface TraceNode {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: string;
  status_message?: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
  children: TraceNode[];
}

interface TraceTreePayload {
  success: boolean;
  traceId: string;
  spanCount: number;
  totalDurationMs: number;
  roots: TraceNode[];
  error?: string;
}

interface TraceTreeViewerProps {
  traceId?: string;
}

function jsonPreview(value: unknown, maxChars: number = 5000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (!text) return "";
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n...<truncated>`;
  } catch {
    return String(value ?? "");
  }
}

function NodeItem(props: {
  node: TraceNode;
  level: number;
  collapsed: Set<string>;
  onToggle: (spanId: string) => void;
}) {
  const { node, level, collapsed, onToggle } = props;
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.span_id);
  const paddingLeft = 12 + level * 16;

  return (
    <div className="border border-white/10 rounded-lg bg-black/20">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        style={{ paddingLeft }}
        onClick={() => {
          if (hasChildren) onToggle(node.span_id);
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight
            className={`w-4 h-4 text-gray-400 transition-transform ${hasChildren && !isCollapsed ? "rotate-90" : ""} ${
              hasChildren ? "" : "opacity-30"
            }`}
          />
          <span className="font-mono text-sm text-white truncate">{node.name}</span>
          <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-gray-300 font-mono">{node.kind}</span>
          {node.status !== "OK" && <span className="px-2 py-0.5 rounded bg-red-500/20 text-[10px] text-red-300 font-mono">{node.status}</span>}
        </div>
        <span className="font-mono text-xs text-accent whitespace-nowrap">{node.duration_ms} ms</span>
      </button>

      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-2" style={{ paddingLeft }}>
          {(node.status_message || "").trim().length > 0 && (
            <p className="text-xs text-red-300 font-mono">{node.status_message}</p>
          )}

          {Object.keys(node.attributes || {}).length > 0 && (
            <details className="rounded border border-white/10 bg-black/30 p-2">
              <summary className="cursor-pointer text-xs font-mono text-gray-300">attributes</summary>
              <pre className="mt-2 text-[11px] leading-5 text-green-300 overflow-x-auto">{jsonPreview(node.attributes)}</pre>
            </details>
          )}

          {Array.isArray(node.events) && node.events.length > 0 && (
            <details className="rounded border border-white/10 bg-black/30 p-2">
              <summary className="cursor-pointer text-xs font-mono text-gray-300">events ({node.events.length})</summary>
              <pre className="mt-2 text-[11px] leading-5 text-cyan-300 overflow-x-auto">{jsonPreview(node.events, 9000)}</pre>
            </details>
          )}

          {node.children.length > 0 && (
            <div className="space-y-2">
              {node.children.map((child) => (
                <NodeItem
                  key={child.span_id}
                  node={child}
                  level={level + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TraceTreeViewer({ traceId }: TraceTreeViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<TraceTreePayload | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!traceId) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/traces/tree?traceId=${encodeURIComponent(traceId)}&persist=1`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: TraceTreePayload) => {
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || "Failed to load trace tree");
          setPayload(null);
          return;
        }
        setPayload(data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load trace tree");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [traceId]);

  const hasDebugPayload = useMemo(() => {
    if (!payload?.roots?.length) return false;
    return payload.roots.some((root) =>
      (root.events || []).some((event) => event.name.includes("trace.debug_payload"))
    );
  }, [payload]);

  if (!traceId) {
    return null;
  }

  return (
    <div className="p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/20 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-indigo-300" />
          <p className="text-sm font-mono text-indigo-100">Trace Tree</p>
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-white/20 text-gray-200 hover:bg-white/10 inline-flex items-center gap-1"
          onClick={() => navigator.clipboard.writeText(traceId)}
        >
          <Copy className="w-3 h-3" />
          Copy Trace ID
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-gray-300">
        <span className="px-2 py-1 rounded bg-white/10">trace={traceId}</span>
        {payload && <span className="px-2 py-1 rounded bg-white/10">spans={payload.spanCount}</span>}
        {payload && (
          <span className="px-2 py-1 rounded bg-white/10 inline-flex items-center gap-1">
            <Clock3 className="w-3 h-3" />
            total={payload.totalDurationMs}ms
          </span>
        )}
        {hasDebugPayload && (
          <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 inline-flex items-center gap-1">
            <Bug className="w-3 h-3" />
            debug-payload
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400">Loading trace tree...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && payload?.roots?.length ? (
        <div className="space-y-2">
          {payload.roots.map((root) => (
            <NodeItem
              key={root.span_id}
              node={root}
              level={0}
              collapsed={collapsed}
              onToggle={(spanId) => {
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(spanId)) {
                    next.delete(spanId);
                  } else {
                    next.add(spanId);
                  }
                  return next;
                });
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
