import { NextRequest, NextResponse } from "next/server";
import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";

interface TraceSpanDocument {
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
  attributes?: Record<string, unknown>;
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
}

interface TraceTreeNode {
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
  children: TraceTreeNode[];
}

const TRACE_SPAN_INDEX_PATTERN = process.env.TRACE_SPAN_INDEX_PATTERN || "traces-lance-spans-*";
const TRACE_TREE_INDEX_PREFIX = process.env.TRACE_TREE_INDEX_PREFIX || "traces-lance-tree";

function dateSuffix(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replaceAll("-", ".");
}

function toTraceNode(span: TraceSpanDocument): TraceTreeNode {
  return {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id ?? null,
    name: span.name,
    kind: span.kind,
    status: span.status,
    status_message: span.status_message || "",
    start_time: Number(span.start_time || 0),
    end_time: Number(span.end_time || 0),
    duration_ms: Number(span.duration_ms || 0),
    attributes: (span.attributes || {}) as Record<string, unknown>,
    events: Array.isArray(span.events)
      ? span.events.map((event) => ({
          name: String(event.name || ""),
          timestamp: Number(event.timestamp || 0),
          attributes: (event.attributes || {}) as Record<string, unknown>,
        }))
      : [],
    children: [],
  };
}

function sortTree(node: TraceTreeNode): void {
  node.children.sort((a, b) => a.start_time - b.start_time);
  for (const child of node.children) {
    sortTree(child);
  }
}

function buildTraceTree(spans: TraceSpanDocument[]): { roots: TraceTreeNode[]; spanCount: number } {
  const nodes = new Map<string, TraceTreeNode>();
  for (const span of spans) {
    nodes.set(span.span_id, toTraceNode(span));
  }

  const roots: TraceTreeNode[] = [];
  for (const node of nodes.values()) {
    if (!node.parent_span_id || !nodes.has(node.parent_span_id)) {
      roots.push(node);
      continue;
    }
    nodes.get(node.parent_span_id)!.children.push(node);
  }

  roots.sort((a, b) => a.start_time - b.start_time);
  for (const root of roots) {
    sortTree(root);
  }

  return {
    roots,
    spanCount: nodes.size,
  };
}

async function esRequest(path: string, body?: unknown): Promise<{ ok: boolean; data: any; status: number }> {
  const esHost = (process.env.ES_HOST || CONFIG_ES_HOST || "https://127.0.0.1:9200").replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ES_SECURITY_ENABLED) {
    headers.Authorization = `Basic ${CONFIG_ES_AUTH}`;
  }

  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    const response = await fetch(`${esHost}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data, status: response.status };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

async function findLatestTraceId(): Promise<string | null> {
  const query = {
    size: 1,
    sort: [{ "@timestamp": { order: "desc" } }],
    query: {
      bool: {
        should: [
          { term: { "name.keyword": "lance.search.knn" } },
          { term: { "name.keyword": "lance.search.hybrid" } },
          { term: { name: "lance.search.knn" } },
          { term: { name: "lance.search.hybrid" } },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ["trace_id"],
  };
  const result = await esRequest(`/${encodeURIComponent(TRACE_SPAN_INDEX_PATTERN)}/_search`, query);
  if (!result.ok) return null;
  const traceId = result.data?.hits?.hits?.[0]?._source?.trace_id;
  return typeof traceId === "string" && traceId.length > 0 ? traceId : null;
}

async function loadTraceSpans(traceId: string): Promise<TraceSpanDocument[]> {
  const query = {
    size: 2000,
    sort: [{ start_time: { order: "asc" } }],
    query: {
      bool: {
        should: [
          { term: { "trace_id.keyword": traceId } },
          { term: { trace_id: traceId } },
        ],
        minimum_should_match: 1,
      },
    },
  };

  const result = await esRequest(`/${encodeURIComponent(TRACE_SPAN_INDEX_PATTERN)}/_search`, query);
  if (!result.ok) return [];
  const hits = Array.isArray(result.data?.hits?.hits) ? result.data.hits.hits : [];
  return hits
    .map((hit: any) => hit?._source)
    .filter((source: any) => source && typeof source.trace_id === "string") as TraceSpanDocument[];
}

async function persistTreeDocument(payload: {
  traceId: string;
  roots: TraceTreeNode[];
  spanCount: number;
  earliestStart: number;
  latestEnd: number;
}): Promise<void> {
  const indexName = `${TRACE_TREE_INDEX_PREFIX}-${dateSuffix()}`;
  const doc = {
    "@timestamp": new Date().toISOString(),
    trace_id: payload.traceId,
    span_count: payload.spanCount,
    duration_ms: Math.max(0, payload.latestEnd - payload.earliestStart),
    root_spans: payload.roots.map((item) => item.name),
    roots: payload.roots,
  };
  await esRequest(`/${encodeURIComponent(indexName)}/_doc`, doc);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTraceId = searchParams.get("traceId")?.trim();
    const persist = searchParams.get("persist") !== "0";

    const traceId = requestedTraceId || (await findLatestTraceId());
    if (!traceId) {
      return NextResponse.json(
        {
          success: false,
          error: "No trace found",
        },
        { status: 404 }
      );
    }

    const spans = await loadTraceSpans(traceId);
    if (spans.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No spans found for trace_id=${traceId}`,
          traceId,
        },
        { status: 404 }
      );
    }

    const tree = buildTraceTree(spans);
    const earliestStart = Math.min(...spans.map((span) => Number(span.start_time || 0)));
    const latestEnd = Math.max(...spans.map((span) => Number(span.end_time || 0)));
    const totalDurationMs = Math.max(0, latestEnd - earliestStart);

    if (persist) {
      await persistTreeDocument({
        traceId,
        roots: tree.roots,
        spanCount: tree.spanCount,
        earliestStart,
        latestEnd,
      });
    }

    return NextResponse.json({
      success: true,
      traceId,
      sourceIndexPattern: TRACE_SPAN_INDEX_PATTERN,
      spanCount: tree.spanCount,
      totalDurationMs,
      roots: tree.roots,
      persisted: persist,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to load trace tree",
      },
      { status: 500 }
    );
  }
}
