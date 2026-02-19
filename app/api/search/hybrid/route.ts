import { NextRequest, NextResponse } from "next/server";
import { ES_HOST, ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";
import { getTracer, SpanStatusCode, SpanKind, trace, context } from "@/lib/tracing";
import { traceAsync } from "@/lib/tracing-utils";
import { jinaFetchWithRetry } from "@/lib/oss-client";
import { resolveSearchIndex } from "@/lib/dataset-profile";
import { buildTraceDebugPayload, isTraceDebugEnabled, safeTraceJson } from "@/lib/trace-debug";
import {
  buildLanceKnnQuery,
  buildSearchEvidence,
  normalizeNprobes,
  resolvePrefilterMode,
  sanitizeFilter,
} from "@/lib/search-capabilities";

interface HybridSearchRequest {
  dataset?: string;
  k?: number;
  numCandidates?: number;
  queryText?: string;
  queryVector?: number[];
  textWeight?: number;
  vectorWeight?: number;
  esEndpoint?: string;
  esIndex?: string;
  filter?: Record<string, unknown>;
  nprobes?: number;
  refreshState?: string;
  shardingStrategy?: string;
  datasetProfile?: {
    shardingStrategy?: string;
  };
}

interface HybridSearchResult {
  id: string;
  category: string;
  text: string;
  score: number;
  matchType: 'text' | 'vector' | 'hybrid';
  evidence?: Record<string, unknown>;
}

interface TimingBreakdown {
  phase: string;
  duration: number;
  startOffset: number;
  lance_vector_query_ms?: string;
  breakdown?: any;
  [key: string]: any;
}

interface VectorSearchExecution {
  results: HybridSearchResult[];
  totalHits: number;
  profile?: any;
  filterApplied: boolean;
  nprobesApplied: boolean;
  prefilterReason?: string;
  requestAttempts: Array<{
    stage: string;
    requestBody: Record<string, unknown>;
    status: 'ok' | 'error';
    error?: string;
  }>;
}

type ExecuteVectorSearchOutcome =
  | { ok: true; data: any; requestBody: Record<string, unknown> }
  | { ok: false; error: Error; requestBody: Record<string, unknown> };

function extractErrorReason(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message.slice(0, 300);
  }
  return 'unknown_error';
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
    console.error('Failed to resolve default dataset for hybrid search:', error);
    return undefined;
  }
}

// Generate embedding for query text using Jina API
async function generateQueryEmbedding(queryText: string): Promise<number[]> {
  const JINA_API_KEY = process.env.JINA_API_KEY || 'jina_4d22586fca5140e99831e91c67f7b09aBX3XfmHSkXlBEhn3PvJna9cZYOXb';

  if (!JINA_API_KEY) {
    throw new Error('JINA_API_KEY environment variable is not set');
  }

  const response = await jinaFetchWithRetry('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: queryText,
      encoding_type: 'float',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jina API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.data && data.data[0] && data.data[0].embedding) {
    return data.data[0].embedding;
  }
  throw new Error('Invalid response format from Jina API');
}

// Perform BM25 text search (optionally filtered by dataset)
async function performTextSearch(
  index: string,
  queryText: string,
  size: number,
  dataset?: string,
  filter?: Record<string, unknown>
): Promise<{ results: HybridSearchResult[]; totalHits: number; requestBody: Record<string, unknown> }> {
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ES_SECURITY_ENABLED) {
      headers['Authorization'] = `Basic ${ES_AUTH}`;
    }

    const must: Array<Record<string, unknown>> = [{ match: { text: queryText } }];
    const filters: Array<Record<string, unknown>> = [];

    if (dataset) {
      filters.push({ term: { dataset } });
    }
    if (filter) {
      filters.push(filter);
    }

    const query = filters.length > 0
      ? { bool: { must, filter: filters } }
      : must[0];

    const requestBody = {
      query,
      size,
      _source: ['id', 'category', 'text'],
    };

    const response = await fetch(`${ES_HOST}/${index}/_search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Text search failed: ${response.statusText} ${responseBody.slice(0, 300)}`);
    }

    const data = await response.json();

    const results: HybridSearchResult[] = data.hits.hits.map((hit: any) => ({
      id: hit._source?.id || hit._id,
      category: hit._source?.category || 'unknown',
      text: hit._source?.text || '',
      score: hit._score || 0,
      matchType: 'text' as const,
    }));

    return { results, totalHits: data.hits.total.value, requestBody };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

async function executeVectorSearchRequest(options: {
  index: string;
  queryVector: number[];
  k: number;
  numCandidates: number;
  filter?: Record<string, unknown>;
  nprobes?: number;
}): Promise<ExecuteVectorSearchOutcome> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ES_SECURITY_ENABLED) {
    headers['Authorization'] = `Basic ${ES_AUTH}`;
  }

  const requestBody = {
    profile: true,
    query: buildLanceKnnQuery({
      queryVector: options.queryVector,
      k: options.k,
      numCandidates: options.numCandidates,
      filter: options.filter,
      nprobes: options.nprobes,
    }),
    size: options.k,
    _source: ['id', 'category', 'text'],
  };

  const response = await fetch(`${ES_HOST}/${options.index}/_search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      error: new Error(`Vector search failed: ${response.status} - ${errorText.slice(0, 500)}`),
      requestBody,
    };
  }

  return {
    ok: true,
    data: await response.json(),
    requestBody,
  };
}

// Perform vector kNN search with graceful fallback for filter/nprobes
async function performVectorSearch(
  index: string,
  queryVector: number[],
  k: number,
  numCandidates: number,
  filter?: Record<string, unknown>,
  nprobes?: number
): Promise<VectorSearchExecution> {
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const filterProvided = Boolean(filter);
    const nprobesProvided = typeof nprobes === 'number';

    let filterApplied = filterProvided;
    let nprobesApplied = nprobesProvided;
    let prefilterReason: string | undefined;
    const requestAttempts: VectorSearchExecution["requestAttempts"] = [];

    let data: any = null;
    let latestError: unknown;

    const primary = await executeVectorSearchRequest({
      index,
      queryVector,
      k,
      numCandidates,
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
      const retryWithoutNprobes = await executeVectorSearchRequest({
        index,
        queryVector,
        k,
        numCandidates,
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
      const retryWithoutFilter = await executeVectorSearchRequest({
        index,
        queryVector,
        k,
        numCandidates,
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
      throw latestError instanceof Error ? latestError : new Error('Vector search failed');
    }

    const results: HybridSearchResult[] = data.hits.hits.map((hit: any) => ({
      id: hit._source?.id || hit._id,
      category: hit._source?.category || 'unknown',
      text: hit._source?.text || '',
      score: hit._score || 0,
      matchType: 'vector' as const,
    }));

    return {
      results,
      totalHits: data.hits.total.value,
      profile: data.profile,
      filterApplied,
      nprobesApplied,
      prefilterReason,
      requestAttempts,
    };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// RRF (Reciprocal Rank Fusion) scoring
function rrfFusion(
  textResults: HybridSearchResult[],
  vectorResults: HybridSearchResult[],
  k: number,
  textWeight: number = 0.5,
  vectorWeight: number = 0.5
): HybridSearchResult[] {
  const fused = new Map<string, { result: HybridSearchResult; textRank?: number; vectorRank?: number }>();

  textResults.forEach((result, index) => {
    fused.set(result.id, { result, textRank: index + 1 });
  });

  vectorResults.forEach((result, index) => {
    const existing = fused.get(result.id);

    if (existing) {
      existing.vectorRank = index + 1;
    } else {
      fused.set(result.id, { result, vectorRank: index + 1 });
    }
  });

  const scoredResults: HybridSearchResult[] = [];

  fused.forEach(({ result, textRank, vectorRank }) => {
    let rrfScore = 0;
    let matchType: 'text' | 'vector' | 'hybrid' = 'hybrid';

    if (textRank !== undefined && vectorRank !== undefined) {
      const textScore = 1 / (60 + textRank);
      const vectorScore = 1 / (60 + vectorRank);
      rrfScore = (textScore * textWeight + vectorScore * vectorWeight);
    } else if (textRank !== undefined) {
      rrfScore = (1 / (60 + textRank)) * textWeight;
      matchType = 'text';
    } else if (vectorRank !== undefined) {
      rrfScore = (1 / (60 + vectorRank)) * vectorWeight;
      matchType = 'vector';
    }

    scoredResults.push({
      ...result,
      score: rrfScore,
      matchType,
    });
  });

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.slice(0, k);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const timingBreakdown: TimingBreakdown[] = [];
  const debugEnabled = isTraceDebugEnabled();

  const tracer = getTracer();

  const rootSpan = tracer.startSpan('lance.search.hybrid', {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': 'POST',
      'http.url': '/api/search/hybrid',
      'search.type': 'hybrid',
      'trace.debug_enabled': debugEnabled,
    },
  });

  return context.with(trace.setSpan(context.active(), rootSpan), async () => {
    try {
      const body = await req.json() as HybridSearchRequest;
      const {
        dataset: requestedDataset,
        k = 10,
        numCandidates = k * 2,
        queryText = '',
        queryVector,
        textWeight = 0.5,
        vectorWeight = 0.5,
      } = body;

      const filter = sanitizeFilter(body.filter);
      const nprobes = normalizeNprobes(body.nprobes);

      const requiredDims = queryVector && queryVector.length > 0 ? queryVector.length : 768;
      let selectedDataset = requestedDataset;
      if (!selectedDataset) {
        selectedDataset = await selectDefaultDataset(requiredDims);
        if (!selectedDataset) {
          return NextResponse.json(
            {
              success: false,
              error: `No dataset available for ${requiredDims}-dim hybrid search. Please generate/backfill a compatible dataset first.`,
            },
            { status: 400 }
          );
        }
      }

      const ES_INDEX = resolveSearchIndex(
        selectedDataset,
        body.esIndex,
        process.env.ES_INDEX || 'lance-validation-test'
      );

      rootSpan.setAttribute('search.k', k);
      rootSpan.setAttribute('search.num_candidates', numCandidates);
      rootSpan.setAttribute('search.text_weight', textWeight);
      rootSpan.setAttribute('search.vector_weight', vectorWeight);
      rootSpan.setAttribute('es.index', ES_INDEX);
      rootSpan.setAttribute('search.filter_provided', Boolean(filter));
      if (typeof nprobes === 'number') {
        rootSpan.setAttribute('search.nprobes', nprobes);
      }
      if (selectedDataset) rootSpan.setAttribute('search.dataset', selectedDataset);
      if (queryText) rootSpan.setAttribute('search.query_text', queryText.substring(0, 100));

      if (!queryVector && !queryText) {
        return NextResponse.json(
          {
            success: false,
            error: 'At least one of queryText or queryVector must be provided',
          },
          { status: 400 }
        );
      }

      let textResults: HybridSearchResult[] = [];
      let vectorResults: HybridSearchResult[] = [];
      let fusionResults: HybridSearchResult[] = [];
      let finalQueryVector = queryVector;
      let esProfileData: any = null;
      let textRequestBody: Record<string, unknown> | undefined;
      let vectorSearchMeta: { filterApplied: boolean; nprobesApplied: boolean; prefilterReason?: string } = {
        filterApplied: Boolean(filter),
        nprobesApplied: typeof nprobes === 'number',
      };
      let vectorSearchAttempts: VectorSearchExecution["requestAttempts"] = [];

      if (queryText && !queryVector) {
        const embedStart = Date.now();
        try {
          finalQueryVector = await traceAsync(
            'jina.embedding.generate',
            async (embedSpan) => {
              embedSpan.setAttribute('embedding.model', 'jina-embeddings-v2-base-en');
              embedSpan.setAttribute('embedding.input_length', queryText.length);
              const vector = await generateQueryEmbedding(queryText);
              embedSpan.setAttribute('embedding.dimensions', vector.length);
              return vector;
            },
            { kind: SpanKind.CLIENT }
          );
          const embedDuration = Date.now() - embedStart;
          timingBreakdown.push({
            phase: 'Embedding Generation',
            duration: embedDuration,
            startOffset: embedStart - startTime,
          });
        } catch (error: any) {
          rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          rootSpan.end();
          return NextResponse.json(
            {
              success: false,
              error: `Failed to generate embedding for query text: ${error.message}`,
            },
            { status: 500 }
          );
        }
      } else if (queryVector) {
        timingBreakdown.push({
          phase: 'Embedding Generation',
          duration: 0,
          startOffset: 0,
        });
      }

      if (queryText) {
        const textSearchStart = Date.now();
        const textSearch = await traceAsync(
          'elasticsearch.search.bm25',
          async (bm25Span) => {
            bm25Span.setAttribute('es.index', ES_INDEX);
            bm25Span.setAttribute('search.query_text', queryText.substring(0, 100));
            bm25Span.setAttribute('search.size', k * 2);
            const result = await performTextSearch(ES_INDEX, queryText, k * 2, selectedDataset, filter);
            bm25Span.setAttribute('es.hits_count', result.results.length);
            bm25Span.setAttribute('es.total_hits', result.totalHits);
            if (debugEnabled) {
              bm25Span.addEvent("trace.debug_request", {
                payload: safeTraceJson(result.requestBody, 10000),
              });
            }
            return result;
          },
          { kind: SpanKind.CLIENT }
        );
        const textSearchDuration = Date.now() - textSearchStart;
        textResults = textSearch.results;
        textRequestBody = textSearch.requestBody;
        timingBreakdown.push({
          phase: 'Text Search (BM25)',
          duration: textSearchDuration,
          startOffset: textSearchStart - startTime,
        });
      }

      if (finalQueryVector) {
        const vectorSearchStart = Date.now();
        try {
          const vectorSearch = await traceAsync(
            'elasticsearch.search.knn',
            async (knnSpan) => {
              knnSpan.setAttribute('es.index', ES_INDEX);
              knnSpan.setAttribute('search.k', k);
              knnSpan.setAttribute('search.num_candidates', numCandidates);
              knnSpan.setAttribute('search.vector_dimensions', finalQueryVector!.length);
              const result = await performVectorSearch(ES_INDEX, finalQueryVector!, k, numCandidates, filter, nprobes);
              knnSpan.setAttribute('es.hits_count', result.results.length);
              knnSpan.setAttribute('es.total_hits', result.totalHits);
              return result;
            },
            { kind: SpanKind.CLIENT }
          );

          vectorSearchMeta = {
            filterApplied: vectorSearch.filterApplied,
            nprobesApplied: vectorSearch.nprobesApplied,
            prefilterReason: vectorSearch.prefilterReason,
          };
          vectorSearchAttempts = vectorSearch.requestAttempts;

          const vectorSearchDuration = Date.now() - vectorSearchStart;
          vectorResults = vectorSearch.results;
          esProfileData = vectorSearch.profile;

          const detailedTiming: any = {
            phase: 'Vector Search (kNN)',
            duration: vectorSearchDuration,
            startOffset: vectorSearchStart - startTime,
          };

          if (vectorSearch.profile) {
            const profileData = vectorSearch.profile;
            if (profileData.shards && profileData.shards[0]) {
              const shard = profileData.shards[0];
              if (shard.searches && shard.searches.length > 0) {
                for (const searchEntry of shard.searches) {
                  if (searchEntry.query && Array.isArray(searchEntry.query)) {
                    for (const query of searchEntry.query) {
                      if (query.type === 'LanceKnnQuery' || query.type === 'LanceVectorQuery') {
                        if (query.time_in_nanos) {
                          const lanceTimeMs = query.time_in_nanos / 1_000_000;
                          detailedTiming.lance_vector_query_ms = lanceTimeMs.toFixed(2);
                          detailedTiming.query_type = query.type;
                          detailedTiming.description = query.description;
                          if (query.breakdown) {
                            detailedTiming.breakdown = query.breakdown;
                          }
                        }
                        break;
                      }
                    }
                  }
                }
              }
            }
          }

          timingBreakdown.push(detailedTiming);
        } catch (vectorError: any) {
          throw new Error(`Vector search via Elasticsearch failed: ${vectorError?.message || String(vectorError)}`);
        }
      }

      if (queryText && finalQueryVector) {
        const fusionStart = Date.now();
        fusionResults = await traceAsync(
          'search.fusion.rrf',
          async (fusionSpan) => {
            fusionSpan.setAttribute('fusion.text_results', textResults.length);
            fusionSpan.setAttribute('fusion.vector_results', vectorResults.length);
            fusionSpan.setAttribute('fusion.text_weight', textWeight);
            fusionSpan.setAttribute('fusion.vector_weight', vectorWeight);
            const fused = rrfFusion(textResults, vectorResults, k, textWeight, vectorWeight);
            fusionSpan.setAttribute('fusion.output_count', fused.length);
            return fused;
          },
          { kind: SpanKind.INTERNAL }
        );
        const fusionDuration = Date.now() - fusionStart;
        timingBreakdown.push({
          phase: 'RRF Fusion',
          duration: fusionDuration,
          startOffset: fusionStart - startTime,
        });
      } else if (queryText) {
        fusionResults = textResults.slice(0, k);
      } else if (finalQueryVector) {
        fusionResults = vectorResults.slice(0, k);
      }

      const latency = Date.now() - startTime;
      const prefilterMode = resolvePrefilterMode({
        filterProvided: Boolean(filter),
        filterApplied: vectorSearchMeta.filterApplied,
      });

      const shardMode =
        body.datasetProfile?.shardingStrategy ||
        body.shardingStrategy;

      const evidence = buildSearchEvidence({
        shardingStrategy: shardMode,
        prefilterMode,
        refreshState: body.refreshState,
        prefilterReason: vectorSearchMeta.prefilterReason,
        nprobes,
        nprobesApplied: vectorSearchMeta.nprobesApplied,
      });

      const fusedWithEvidence = fusionResults.map((item) => ({
        ...item,
        evidence,
      }));

      rootSpan.setAttribute('search.results_count', fusedWithEvidence.length);
      rootSpan.setAttribute('search.text_results', textResults.length);
      rootSpan.setAttribute('search.vector_results', vectorResults.length);
      rootSpan.setAttribute('http.status_code', 200);
      rootSpan.setStatus({ code: SpanStatusCode.OK });

      const traceId = rootSpan.spanContext().traceId;
      let traceDebug: unknown;
      if (debugEnabled) {
        const requestAttempts = [
          ...(textRequestBody
            ? [{
                stage: "bm25_primary",
                requestBody: textRequestBody,
                status: "ok" as const,
              }]
            : []),
          ...vectorSearchAttempts.map((item) => ({
            stage: `knn_${item.stage}`,
            requestBody: item.requestBody,
            status: item.status,
            error: item.error,
          })),
        ];
        traceDebug = await buildTraceDebugPayload({
          esIndex: ES_INDEX,
          profile: esProfileData,
          requestAttempts,
        });
        rootSpan.addEvent("trace.debug_payload", {
          payload: safeTraceJson(traceDebug),
        });
      }

      return NextResponse.json({
        success: true,
        results: fusedWithEvidence,
        textResults: textResults.length,
        vectorResults: vectorResults.length,
        fusionResults: fusedWithEvidence.length,
        queryText,
        queryVector: finalQueryVector,
        latency: `${latency}ms`,
        timingBreakdown,
        esProfile: esProfileData,
        esIndex: ES_INDEX,
        evidence,
        traceDebug,
        traceId,
      });
    } catch (error: any) {
      console.error('Hybrid search error:', error);
      rootSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Hybrid search failed',
      });
      rootSpan.recordException(error instanceof Error ? error : new Error(String(error)));
      rootSpan.setAttribute('http.status_code', 500);

      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Hybrid search failed',
          traceId: rootSpan.spanContext().traceId,
        },
        { status: 500 }
      );
    } finally {
      rootSpan.end();
    }
  });
}
