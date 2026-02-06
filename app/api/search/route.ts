import { NextRequest, NextResponse } from "next/server";
import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";
import { getTracer, SpanStatusCode, SpanKind, trace, context } from "@/lib/tracing";
import { traceAsync } from "@/lib/tracing-utils";

interface SearchRequest {
  dataset?: string;
  k?: number;
  numCandidates?: number;
  profile?: boolean;
  useExistingVector?: boolean;
  queryVector?: number[];
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

// Search through Elasticsearch with Lance plugin and profiling
async function searchThroughElasticsearch(
  queryVector: number[],
  k: number,
  numCandidates: number,
  profile: boolean,
  esIndex?: string
): Promise<{ results: LanceSearchResult[]; timing?: ESTimingData; vectorsCount: number; dimensions: number }> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const ES_INDEX = esIndex || process.env.ES_INDEX || 'lance-validation-test';

  // Ignore self-signed certificates for local ES
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
  // Build Elasticsearch Lance kNN query with profile
  const queryBody = {
    profile: profile,
    query: {
      lance_knn: {
        field: "embedding",
        query_vector: queryVector,
        k: k,
        num_candidates: numCandidates
      }
    },
    size: k,
    _source: ["id", "category", "text"] // Fetch text field for document display
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ES_SECURITY_ENABLED) {
    headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
  }

  const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(queryBody)
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch error: ${response.status} ${response.statusText}`);
  }

  const data: ESProfileResponse = await response.json();

  // Extract results
  const results: LanceSearchResult[] = data.hits.hits.map(hit => ({
    id: hit._id,
    vector: [], // Vector is stored in Lance, not in ES document
    category: hit._source?.category || 'unknown',
    text: hit._source?.text || '',
    distance: 1 - hit._score // Convert cosine similarity to distance
  }));

  // Extract timing data if profiled
  let timing: ESTimingData | undefined;
  if (profile && data.profile?.shards?.[0]?.searches?.[0]?.query) {
    timing = {};
    const queries = data.profile.shards[0].searches[0].query;
    for (const query of queries) {
      // Add query type info
      if (query.type) {
        timing['query_type'] = query.type;
      }
      // Add query time in ms
      if (query.time_in_nanos) {
        timing['lance_query_ms'] = Math.round(query.time_in_nanos / 1_000_000);
      }
      // Add debug info if available
      if (query.debug) {
        Object.assign(timing, query.debug);
      }
      // Add breakdown metrics (convert nanos to ms)
      if (query.breakdown) {
        for (const [key, value] of Object.entries(query.breakdown)) {
          const msValue = Math.round(value / 1_000_000);
          // Format key name for display
          const displayKey = key
            .split('_')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          timing[displayKey] = msValue;
        }
      }
    }
    timing['total_query_ms'] = data.took;
  }

  return {
    results,
    timing,
    vectorsCount: data.hits.total.value,
    dimensions: queryVector.length
  };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const tracer = getTracer();

  // Create root span for the entire search operation
  const rootSpan = tracer.startSpan('lance.search.knn', {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': 'POST',
      'http.url': '/api/search',
    },
  });

  return context.with(trace.setSpan(context.active(), rootSpan), async () => {
    try {
      const body = await req.json() as SearchRequest;
      const k = body.k || 5;
      const numCandidates = body.numCandidates || k * 2;
      const profile = body.profile || false;
      const useExistingVector = body.useExistingVector || false;

      rootSpan.setAttribute('search.k', k);
      rootSpan.setAttribute('search.num_candidates', numCandidates);
      rootSpan.setAttribute('search.profile', profile);

    // Get the latest dataset if not specified
    let dataset = body.dataset;
    if (!dataset) {
      // Try to get list of datasets and use the latest one
      // Use localhost with the current port (may differ from 3000 in dev)
      try {
        const port = process.env.PORT || 3001;
        const listRes = await fetch(`http://localhost:${port}/api/vectors/list`);
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.success && listData.datasets.length > 0) {
            dataset = listData.datasets[0].name;
          }
        }
      } catch (e) {
        console.error("Failed to get dataset list:", e);
      }

      // Fallback to default if still no dataset
      if (!dataset) {
        return NextResponse.json(
          {
            success: false,
            error: "No dataset available. Please generate a dataset first.",
            results: [],
            latency: "N/A",
          },
          { status: 400 }
        );
      }
    }

    // Determine query vector
    let queryVector: number[];
    if (body.queryVector && body.queryVector.length > 0) {
      queryVector = body.queryVector;
    } else {
      // Generate a random normalized vector for querying
      queryVector = generateRandomVector(768);
    }

    // Use ES lance_knn for fast vector search
    // ES Lance plugin caches dataset connections for optimal performance
    let searchResults: {
      results: LanceSearchResult[];
      timing?: ESTimingData | { [key: string]: number };
      vectorsCount: number;
      dimensions: number;
    };

    // Try ES lance_knn search first (fast - 30-100ms with cached connection)
    // Use dataset name as ES index (sanitized for ES naming rules)
    // Note: backfill creates indices with 'lance-ds-' prefix
    const sanitizedDatasetName = dataset.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const esIndex = `lance-ds-${sanitizedDatasetName}`;
    rootSpan.setAttribute('es.index', esIndex);

    try {
      // Trace ES kNN search
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
            esIndex
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
      // NO Python fallback - search must go through ES lance_knn plugin
      // If ES index doesn't exist, user must run backfill first
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

    // Format results with cosine similarity (0-1, higher is better)
    const results = searchResults.results.map((r, idx) => ({
      id: r.id,
      category: r.category,
      text: r.text || '',
      score: r.distance, // Cosine similarity from Lance Python
      index: dataset,
      vector: r.vector,
    }));

    // Set final span attributes
    rootSpan.setAttribute('search.results_count', results.length);
    rootSpan.setAttribute('dataset.vectors', searchResults.vectorsCount);
    rootSpan.setAttribute('dataset.dimensions', searchResults.dimensions);
    rootSpan.setAttribute('http.status_code', 200);
    rootSpan.setStatus({ code: SpanStatusCode.OK });

    // Include trace ID in response for debugging
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
      traceId, // Include trace ID for Kibana lookup
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
  }); // End of context.with
}
