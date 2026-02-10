import { NextRequest, NextResponse } from "next/server";
import { ES_HOST, ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";
import { getTracer, SpanStatusCode, SpanKind, trace, context } from "@/lib/tracing";
import { traceAsync } from "@/lib/tracing-utils";
import { jinaFetchWithRetry } from "@/lib/oss-client";

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
}

interface HybridSearchResult {
  id: string;
  category: string;
  text: string;
  score: number;
  matchType: 'text' | 'vector' | 'hybrid';
}

interface TimingBreakdown {
  phase: string;
  duration: number;
  startOffset: number;
  lance_vector_query_ms?: string;
  breakdown?: any;
  [key: string]: any; // Allow additional properties
}

interface HybridSearchResponse {
  success: boolean;
  results?: HybridSearchResult[];
  textResults?: number;
  vectorResults?: number;
  fusionResults?: number;
  queryVector?: number[];
  queryText?: string;
  error?: string;
  latency?: string;
  timingBreakdown?: TimingBreakdown[];
  esProfile?: any; // Raw ES profiling data for debugging
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
  } else {
    throw new Error('Invalid response format from Jina API');
  }
}

// Perform BM25 text search (optionally filtered by dataset)
async function performTextSearch(
  index: string,
  queryText: string,
  size: number,
  dataset?: string
): Promise<{ results: HybridSearchResult[]; totalHits: number }> {

  // Ignore self-signed certificates for local ES
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ES_SECURITY_ENABLED) {
      headers['Authorization'] = `Basic ${ES_AUTH}`;
    }

    // Build query: wrap in bool filter when dataset is specified
    const matchQuery = { match: { text: queryText } };
    const query = dataset
      ? { bool: { must: [matchQuery], filter: [{ term: { dataset } }] } }
      : matchQuery;

    const response = await fetch(`${ES_HOST}/${index}/_search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        size,
        _source: ['id', 'category', 'text'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Text search failed: ${response.statusText}`);
    }

    const data = await response.json();

    const results: HybridSearchResult[] = data.hits.hits.map((hit: any) => ({
      id: hit._source?.id || hit._id,
      category: hit._source?.category || 'unknown',
      text: hit._source?.text || '',
      score: hit._score || 0,
      matchType: 'text' as const,
    }));

    return { results, totalHits: data.hits.total.value };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Perform vector kNN search
async function performVectorSearch(
  index: string,
  queryVector: number[],
  k: number,
  numCandidates: number
): Promise<{ results: HybridSearchResult[]; totalHits: number; profile?: any }> {

  // Ignore self-signed certificates for local ES
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ES_SECURITY_ENABLED) {
      headers['Authorization'] = `Basic ${ES_AUTH}`;
    }

    const response = await fetch(`${ES_HOST}/${index}/_search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        profile: true,
        query: {
          lance_knn: {
            field: 'embedding',
            query_vector: queryVector,
            k,
            num_candidates: numCandidates,
          }
        },
        size: k,
        _source: ['id', 'category', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ES kNN search error:', response.status, errorText);
      throw new Error(`Vector search failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const results: HybridSearchResult[] = data.hits.hits.map((hit: any) => ({
      id: hit._source?.id || hit._id,
      category: hit._source?.category || 'unknown',
      text: hit._source?.text || '',
      score: hit._score || 0,
      matchType: 'vector' as const,
    }));

    // Extract profile data for detailed timing breakdown
    let profileData: any = null;
    if (data.profile) {
      profileData = data.profile;
      // Log profile for debugging
      console.log('ES Profile:', JSON.stringify(profileData, null, 2));
    }

    return { results, totalHits: data.hits.total.value, profile: profileData };
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

  // Assign ranks to text results
  textResults.forEach((result, index) => {
    fused.set(result.id, { result, textRank: index + 1 });
  });

  // Update ranks with vector results and calculate RRF score
  vectorResults.forEach((result, index) => {
    const existing = fused.get(result.id);

    if (existing) {
      existing.vectorRank = index + 1;
    } else {
      fused.set(result.id, { result, vectorRank: index + 1 });
    }
  });

  // Calculate RRF score: 1/(k+rank) for each ranking, weighted sum
  const scoredResults: HybridSearchResult[] = [];

  fused.forEach(({ result, textRank, vectorRank }) => {
    let rrfScore = 0;
    let matchType: 'text' | 'vector' | 'hybrid' = 'hybrid';

    if (textRank !== undefined && vectorRank !== undefined) {
      // Both present - use RRF
      const textScore = 1 / (60 + textRank); // k=60 for text
      const vectorScore = 1 / (60 + vectorRank); // k=60 for vector
      rrfScore = (textScore * textWeight + vectorScore * vectorWeight);
    } else if (textRank !== undefined) {
      // Text only
      rrfScore = (1 / (60 + textRank)) * textWeight;
      matchType = 'text';
    } else if (vectorRank !== undefined) {
      // Vector only
      rrfScore = (1 / (60 + vectorRank)) * vectorWeight;
      matchType = 'vector';
    }

    scoredResults.push({
      ...result,
      score: rrfScore,
      matchType,
    });
  });

  // Sort by RRF score descending and take top k
  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.slice(0, k);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const timingBreakdown: TimingBreakdown[] = [];

  const tracer = getTracer();

  // Create root span for the entire hybrid search operation
  const rootSpan = tracer.startSpan('lance.search.hybrid', {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': 'POST',
      'http.url': '/api/search/hybrid',
      'search.type': 'hybrid',
    },
  });

  return context.with(trace.setSpan(context.active(), rootSpan), async () => {
    try {
      const body = await req.json() as HybridSearchRequest;
      const {
        dataset,
        k = 10,
        numCandidates = k * 2,
        queryText = '',
        queryVector,
        textWeight = 0.5,
        vectorWeight = 0.5,
      } = body;

      const ES_INDEX = body.esIndex || process.env.ES_INDEX || 'lance-validation-test';

      rootSpan.setAttribute('search.k', k);
      rootSpan.setAttribute('search.num_candidates', numCandidates);
      rootSpan.setAttribute('search.text_weight', textWeight);
      rootSpan.setAttribute('search.vector_weight', vectorWeight);
      rootSpan.setAttribute('es.index', ES_INDEX);
      if (queryText) rootSpan.setAttribute('search.query_text', queryText.substring(0, 100));

    // If no query vector and no query text, we can't search
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

    // Generate embedding from query text if no query vector provided
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

    // Perform text search if query text provided
    if (queryText) {
      const textSearchStart = Date.now();
      const textSearch = await traceAsync(
        'elasticsearch.search.bm25',
        async (bm25Span) => {
          bm25Span.setAttribute('es.index', ES_INDEX);
          bm25Span.setAttribute('search.query_text', queryText.substring(0, 100));
          bm25Span.setAttribute('search.size', k * 2);
          const result = await performTextSearch(ES_INDEX, queryText, k * 2, dataset);
          bm25Span.setAttribute('es.hits_count', result.results.length);
          bm25Span.setAttribute('es.total_hits', result.totalHits);
          return result;
        },
        { kind: SpanKind.CLIENT }
      );
      const textSearchDuration = Date.now() - textSearchStart;
      textResults = textSearch.results;
      timingBreakdown.push({
        phase: 'Text Search (BM25)',
        duration: textSearchDuration,
        startOffset: textSearchStart - startTime,
      });
    }

    // Perform vector search if query vector provided or generated (always via ES lance_knn)
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
            const result = await performVectorSearch(ES_INDEX, finalQueryVector!, k, numCandidates);
            knnSpan.setAttribute('es.hits_count', result.results.length);
            knnSpan.setAttribute('es.total_hits', result.totalHits);
            return result;
          },
          { kind: SpanKind.CLIENT }
        );

        const vectorSearchDuration = Date.now() - vectorSearchStart;
        vectorResults = vectorSearch.results;
        esProfileData = vectorSearch.profile; // Store profile data for response

        // Extract detailed timing from ES profile if available
        let detailedTiming = {
          phase: 'Vector Search (kNN)',
          duration: vectorSearchDuration,
          startOffset: vectorSearchStart - startTime,
        } as any;

      if (vectorSearch.profile) {
        // Parse ES profile to get Lance Vector Plugin timing breakdown
        const profile = vectorSearch.profile;
        if (profile.shards && profile.shards[0]) {
          const shard = profile.shards[0];
          // ES profile structure: shard.searches[x].query[y]
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
        // Vector search failed - log warning and fall back to text-only search
        console.warn('Vector search failed, falling back to text-only:', vectorError.message);
        timingBreakdown.push({
          phase: 'Vector Search (kNN)',
          duration: 0,
          startOffset: Date.now() - startTime,
          error: vectorError.message,
        });
        // Clear finalQueryVector to indicate vector search failed
        finalQueryVector = undefined;
      }
    }

    // Perform fusion if both searches were performed
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

    // Set final span attributes
    rootSpan.setAttribute('search.results_count', fusionResults.length);
    rootSpan.setAttribute('search.text_results', textResults.length);
    rootSpan.setAttribute('search.vector_results', vectorResults.length);
    rootSpan.setAttribute('http.status_code', 200);
    rootSpan.setStatus({ code: SpanStatusCode.OK });

    const traceId = rootSpan.spanContext().traceId;

    return NextResponse.json({
      success: true,
      results: fusionResults,
      textResults: textResults.length,
      vectorResults: vectorResults.length,
      fusionResults: fusionResults.length,
      queryText,
      queryVector: finalQueryVector,
      latency: `${latency}ms`,
      timingBreakdown,
      esProfile: esProfileData, // Include raw ES profile for debugging
      traceId, // Include trace ID for Kibana lookup
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
  }); // End of context.with
}
