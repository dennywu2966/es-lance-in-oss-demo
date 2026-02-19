import { NextRequest, NextResponse } from "next/server";
import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";
import { getTracer, SpanStatusCode, SpanKind, trace, context } from "@/lib/tracing";
import { traceAsync } from "@/lib/tracing-utils";
import { resolveSearchIndex } from "@/lib/dataset-profile";
import { buildTraceDebugPayload, isTraceDebugEnabled, safeTraceJson } from "@/lib/trace-debug";
import {
  buildLanceKnnQuery,
  buildSearchEvidence,
  normalizeNprobes,
  resolvePrefilterMode,
  sanitizeFilter,
} from "@/lib/search-capabilities";

interface SearchRequest {
  dataset?: string;
  esIndex?: string;
  k?: number;
  numCandidates?: number;
  profile?: boolean;
  useExistingVector?: boolean;
  queryVector?: number[];
  filter?: Record<string, unknown>;
  nprobes?: number;
  refreshState?: string;
  shardingStrategy?: string;
  datasetProfile?: {
    shardingStrategy?: string;
  };
}

interface LanceSearchResult {
  id: string;
  vector: number[];
  category: string;
  distance: number;
  text?: string;
}

interface ESTimingData {
  [key: string]: number | string;
}

interface ESProfileResponse {
  took: number;
  timed_out: boolean;
  hits: {
    total: { value: number };
    hits: Array<{
      _id: string;
      _score: number;
      _source: {
        id?: string;
        category?: string;
        text?: string;
      };
    }>;
  };
  profile?: {
    shards: Array<{
      id: string;
      searches: Array<{
        query: Array<{
          type: string;
          description?: string;
          time_in_nanos: number;
          breakdown?: {
            [key: string]: number;
          };
          debug?: ESTimingData;
        }>;
      }>;
    }>;
  };
}

interface SearchExecutionResult {
  data: ESProfileResponse;
  filterApplied: boolean;
  nprobesApplied: boolean;
  prefilterReason?: string;
}

interface SearchRequestAttempt {
  stage: string;
  requestBody: Record<string, unknown>;
  status: 'ok' | 'error';
  error?: string;
}

type ExecuteSearchOutcome =
  | { ok: true; data: ESProfileResponse; requestBody: Record<string, unknown> }
  | { ok: false; error: Error; requestBody: Record<string, unknown> };

// Generate a random normalized vector of 768 dimensions (for embedding queries)
function generateRandomVector(dimensions: number = 768): number[] {
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    vector.push(Math.random());
  }

  // Normalize to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return vector.map(val => val / magnitude);
  }
  return vector;
}

async function selectDefaultDataset(requiredDims: number): Promise<string | undefined> {
  try {
    const port = process.env.PORT || 3001;
    const listRes = await fetch(`http://localhost:${port}/api/vectors/list`);
    if (!listRes.ok) return undefined;

    const listData = await listRes.json();
    const datasets = Array.isArray(listData?.datasets) ? listData.datasets : [];

    const exact = datasets.find((ds: any) =>
      typeof ds?.name === 'string' && Number(ds?.dims || 0) === requiredDims && Number(ds?.vectors || 0) > 0
    );
    if (exact?.name) return exact.name;

    const byName = datasets.find((ds: any) =>
      typeof ds?.name === 'string' && ds.name.includes(`dims-${requiredDims}`)
    );
    if (byName?.name) return byName.name;

    return datasets[0]?.name;
  } catch (error) {
    console.error('Failed to resolve default dataset:', error);
    return undefined;
  }
}

function extractErrorReason(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message.slice(0, 300);
  }
  return 'unknown_error';
}

function extractTiming(profile: boolean, data: ESProfileResponse): ESTimingData | undefined {
  if (!profile || !data.profile?.shards?.[0]?.searches?.[0]?.query) {
    return undefined;
  }

  const timing: ESTimingData = {};
  const queries = data.profile.shards[0].searches[0].query;
  for (const query of queries) {
    if (query.type) {
      timing['query_type'] = query.type;
    }
    if (query.time_in_nanos) {
      timing['lance_query_ms'] = Math.round(query.time_in_nanos / 1_000_000);
    }
    if (query.debug) {
      Object.assign(timing, query.debug);
    }
    if (query.breakdown) {
      for (const [key, value] of Object.entries(query.breakdown)) {
        const msValue = Math.round(value / 1_000_000);
        const displayKey = key
          .split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        timing[displayKey] = msValue;
      }
    }
  }
  timing['total_query_ms'] = data.took;
  return timing;
}

function buildSearchBody(options: {
  queryVector: number[];
  k: number;
  numCandidates: number;
  profile: boolean;
  filter?: Record<string, unknown>;
  nprobes?: number;
}): Record<string, unknown> {
  return {
    profile: options.profile,
    query: buildLanceKnnQuery({
      queryVector: options.queryVector,
      k: options.k,
      numCandidates: options.numCandidates,
      filter: options.filter,
      nprobes: options.nprobes,
    }),
    size: options.k,
    _source: ["id", "category", "text"],
  };
}

async function executeSearchRequest(options: {
  esHost: string;
  esIndex: string;
  queryVector: number[];
  k: number;
  numCandidates: number;
  profile: boolean;
  filter?: Record<string, unknown>;
  nprobes?: number;
}): Promise<ExecuteSearchOutcome> {
  const queryBody = buildSearchBody(options);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ES_SECURITY_ENABLED) {
    headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
  }

  const response = await fetch(`${options.esHost}/${options.esIndex}/_search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(queryBody),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    return {
      ok: false,
      error: new Error(
        `Elasticsearch error: ${response.status} ${response.statusText} ${responseBody.slice(0, 400)}`
      ),
      requestBody: queryBody,
    };
  }

  return {
    ok: true,
    data: await response.json() as ESProfileResponse,
    requestBody: queryBody,
  };
}

// Search through Elasticsearch with Lance plugin and profiling.
// If filter/nprobes is rejected, we degrade gracefully to keep the demo runnable.
async function searchThroughElasticsearch(
  queryVector: number[],
  k: number,
  numCandidates: number,
  profile: boolean,
  esIndex: string,
  filter?: Record<string, unknown>,
  nprobes?: number
): Promise<{
  results: LanceSearchResult[];
  timing?: ESTimingData;
  vectorsCount: number;
  dimensions: number;
  filterApplied: boolean;
  nprobesApplied: boolean;
  prefilterReason?: string;
  profile?: ESProfileResponse["profile"];
  requestAttempts: SearchRequestAttempt[];
}> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;

  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const filterProvided = Boolean(filter);
    const nprobesProvided = typeof nprobes === 'number';

    let filterApplied = filterProvided;
    let nprobesApplied = nprobesProvided;
    let prefilterReason: string | undefined;
    const requestAttempts: SearchRequestAttempt[] = [];

    let data: ESProfileResponse | null = null;
    let latestError: unknown;

    const primary = await executeSearchRequest({
      esHost: ES_HOST,
      esIndex,
      queryVector,
      k,
      numCandidates,
      profile,
      filter,
      nprobes,
    });
    if (primary.ok) {
      requestAttempts.push({ stage: "primary", requestBody: primary.requestBody, status: "ok" });
      data = primary.data;
    } else {
      requestAttempts.push({
        stage: "primary",
        requestBody: primary.requestBody,
        status: "error",
        error: extractErrorReason(primary.error),
      });
      latestError = primary.error;
    }

    if (!data && nprobesProvided) {
      const retryWithoutNprobes = await executeSearchRequest({
        esHost: ES_HOST,
        esIndex,
        queryVector,
        k,
        numCandidates,
        profile,
        filter,
      });
      if (retryWithoutNprobes.ok) {
        requestAttempts.push({ stage: "retry_without_nprobes", requestBody: retryWithoutNprobes.requestBody, status: "ok" });
        data = retryWithoutNprobes.data;
        nprobesApplied = false;
      } else {
        requestAttempts.push({
          stage: "retry_without_nprobes",
          requestBody: retryWithoutNprobes.requestBody,
          status: "error",
          error: extractErrorReason(retryWithoutNprobes.error),
        });
        latestError = retryWithoutNprobes.error;
      }
    }

    if (!data && filterProvided) {
      const retryWithoutFilter = await executeSearchRequest({
        esHost: ES_HOST,
        esIndex,
        queryVector,
        k,
        numCandidates,
        profile,
      });
      if (retryWithoutFilter.ok) {
        requestAttempts.push({ stage: "retry_without_filter", requestBody: retryWithoutFilter.requestBody, status: "ok" });
        data = retryWithoutFilter.data;
        filterApplied = false;
        prefilterReason = extractErrorReason(latestError);
      } else {
        requestAttempts.push({
          stage: "retry_without_filter",
          requestBody: retryWithoutFilter.requestBody,
          status: "error",
          error: extractErrorReason(retryWithoutFilter.error),
        });
        latestError = retryWithoutFilter.error;
      }
    }

    if (!data) {
      throw latestError instanceof Error ? latestError : new Error('Elasticsearch search failed');
    }

    const results: LanceSearchResult[] = data.hits.hits.map(hit => ({
      id: hit._id,
      vector: [],
      category: hit._source?.category || 'unknown',
      text: hit._source?.text || '',
      distance: 1 - hit._score,
    }));

    const timing = extractTiming(profile, data);

    return {
      results,
      timing,
      vectorsCount: data.hits.total.value,
      dimensions: queryVector.length,
      filterApplied,
      nprobesApplied,
      prefilterReason,
      profile: data.profile,
      requestAttempts,
    };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const tracer = getTracer();
  const debugEnabled = isTraceDebugEnabled();

  const rootSpan = tracer.startSpan('lance.search.knn', {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': 'POST',
      'http.url': '/api/search',
      'trace.debug_enabled': debugEnabled,
    },
  });

  return context.with(trace.setSpan(context.active(), rootSpan), async () => {
    try {
      const body = await req.json() as SearchRequest;
      const parsedK = typeof body.k === 'number' ? body.k : Number(body.k);
      const normalizedK = Number.isFinite(parsedK) ? parsedK : 5;
      const k = Math.max(1, Math.min(50, normalizedK));
      const numCandidates = body.numCandidates || k * 2;
      const profile = body.profile || false;
      const filter = sanitizeFilter(body.filter);
      const nprobes = normalizeNprobes(body.nprobes);

      rootSpan.setAttribute('search.k', k);
      rootSpan.setAttribute('search.num_candidates', numCandidates);
      rootSpan.setAttribute('search.profile', profile);
      rootSpan.setAttribute('search.filter_provided', Boolean(filter));
      if (typeof nprobes === 'number') {
        rootSpan.setAttribute('search.nprobes', nprobes);
      }

      const requestedDims = body.queryVector && body.queryVector.length > 0
        ? body.queryVector.length
        : 768;

      let dataset = body.dataset;
      if (!dataset) {
        dataset = await selectDefaultDataset(requestedDims);
        if (!dataset) {
          return NextResponse.json(
            {
              success: false,
              error: `No dataset available for ${requestedDims}-dim query vector. Please generate/backfill a compatible dataset first.`,
              results: [],
              latency: "N/A",
            },
            { status: 400 }
          );
        }
      }

      let queryVector: number[];
      if (body.queryVector && body.queryVector.length > 0) {
        queryVector = body.queryVector;
      } else {
        queryVector = generateRandomVector(768);
      }

      const esIndex = resolveSearchIndex(dataset, body.esIndex, process.env.ES_INDEX || 'lance-validation-test');
      rootSpan.setAttribute('es.index', esIndex);

      let searchResults: {
        results: LanceSearchResult[];
        timing?: ESTimingData | { [key: string]: number };
        vectorsCount: number;
        dimensions: number;
        filterApplied: boolean;
        nprobesApplied: boolean;
        prefilterReason?: string;
        profile?: ESProfileResponse["profile"];
        requestAttempts: SearchRequestAttempt[];
      };

      try {
        searchResults = await traceAsync(
          'elasticsearch.search.knn',
          async (esSpan) => {
            esSpan.setAttribute('es.index', esIndex);
            esSpan.setAttribute('search.k', k);
            esSpan.setAttribute('search.num_candidates', numCandidates);

            const result = await searchThroughElasticsearch(
              queryVector,
              k,
              numCandidates,
              profile,
              esIndex,
              filter,
              nprobes
            );

            esSpan.setAttribute('es.hits_count', result.results.length);
            if (result.timing?.total_query_ms) {
              esSpan.setAttribute('es.took_ms', Number(result.timing.total_query_ms));
            }

            return result;
          },
          { kind: SpanKind.CLIENT }
        );
      } catch (esError: any) {
        const isIndexNotFound = esError.message?.includes('404') ||
                               esError.message?.includes('index_not_found') ||
                               esError.message?.includes('index_not_found_exception');

        if (isIndexNotFound) {
          throw new Error(
            `ES index "${esIndex}" not found. ` +
            `Please run backfill first: POST /api/vectors/backfill with dataset="${dataset}" ` +
            `to create the ES index with lance_vector field.`
          );
        }
        throw esError;
      }

      const latency = Date.now() - startTime;
      const prefilterMode = resolvePrefilterMode({
        filterProvided: Boolean(filter),
        filterApplied: searchResults.filterApplied,
      });

      const shardMode =
        body.datasetProfile?.shardingStrategy ||
        body.shardingStrategy;

      const evidence = buildSearchEvidence({
        shardingStrategy: shardMode,
        prefilterMode,
        refreshState: body.refreshState,
        prefilterReason: searchResults.prefilterReason,
        nprobes,
        nprobesApplied: searchResults.nprobesApplied,
      });

      const results = searchResults.results.map((r) => ({
        id: r.id,
        category: r.category,
        text: r.text || '',
        score: r.distance,
        index: dataset,
        vector: r.vector,
        evidence,
      }));

      rootSpan.setAttribute('search.results_count', results.length);
      rootSpan.setAttribute('dataset.vectors', searchResults.vectorsCount);
      rootSpan.setAttribute('dataset.dimensions', searchResults.dimensions);
      rootSpan.setAttribute('http.status_code', 200);
      rootSpan.setStatus({ code: SpanStatusCode.OK });

      let traceDebug: unknown;
      if (debugEnabled) {
        traceDebug = await buildTraceDebugPayload({
          esIndex,
          profile: searchResults.profile,
          requestAttempts: searchResults.requestAttempts.map((item) => ({
            stage: item.stage,
            requestBody: item.requestBody,
            status: item.status,
            error: item.error,
          })),
        });
        rootSpan.addEvent("trace.debug_payload", {
          payload: safeTraceJson(traceDebug),
        });
      }

      const traceId = rootSpan.spanContext().traceId;

      return NextResponse.json({
        success: true,
        results,
        latency: `${latency}ms`,
        totalHits: searchResults.vectorsCount,
        queryDimension: searchResults.dimensions,
        queryVector,
        datasetName: dataset,
        vectorsCount: searchResults.vectorsCount,
        timing: searchResults.timing,
        evidence,
        traceDebug,
        traceId,
      });
    } catch (error: any) {
      console.error("Search error:", error);
      rootSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Search failed',
      });
      rootSpan.recordException(error instanceof Error ? error : new Error(String(error)));
      rootSpan.setAttribute('http.status_code', 500);

      return NextResponse.json(
        {
          success: false,
          error: error.message || "Search failed",
          results: [],
          latency: "N/A",
          traceId: rootSpan.spanContext().traceId,
        },
        { status: 500 }
      );
    } finally {
      rootSpan.end();
    }
  });
}
