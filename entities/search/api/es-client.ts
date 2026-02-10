/**
 * Direct Elasticsearch client for kNN and hybrid search.
 *
 * This bypasses Next.js API routes for direct performance testing
 * of the Lance Vector Plugin in Elasticsearch.
 */

import { ES_HOST, ES_AUTH, ES_INDEX, JINA_API_KEY, JINA_API_URL, ES_SECURITY_ENABLED } from '../model/config';
import type {
  KnnSearchRequest,
  KnnSearchResponse,
  HybridSearchRequest,
  HybridSearchResponse,
  SearchResult,
  TimingBreakdown,
  TextSearchResponse,
  ESProfile,
} from '../model/types';

/**
 * Ignore self-signed certificates for local ES
 */
function withSSLIgnore<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    return fn();
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = original;
  }
}

/**
 * Build headers for ES requests (conditionally include auth)
 */
function buildESHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ES_SECURITY_ENABLED) {
    headers['Authorization'] = `Basic ${ES_AUTH}`;
  }
  return headers;
}

/**
 * Perform kNN search directly against ES using Lance plugin
 */
export async function performKnnSearch(
  request: KnnSearchRequest
): Promise<KnnSearchResponse> {
  const { query_vector, k, num_candidates = k * 2, profile = true } = request;

  return withSSLIgnore(async () => {
    const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
      method: 'POST',
      headers: buildESHeaders(),
      body: JSON.stringify({
        profile,
        query: {
          lance_knn: {
            field: 'embedding',
            query_vector: query_vector,
            k,
            num_candidates: num_candidates,
          }
        },
        size: k,
        _source: ['id', 'category', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ES kNN search error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  });
}

/**
 * Perform BM25 text search directly against ES
 */
export async function performTextSearch(
  query_text: string,
  size: number,
  profile = true
): Promise<TextSearchResponse> {
  return withSSLIgnore(async () => {
    const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
      method: 'POST',
      headers: buildESHeaders(),
      body: JSON.stringify({
        profile,
        query: {
          match: {
            text: query_text,
          },
        },
        size,
        _source: ['id', 'category', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ES text search error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  });
}

/**
 * Generate embedding for query text using Jina API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(JINA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: text,
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

/**
 * Convert ES text search hits to SearchResults
 */
function textHitsToResults(hits: TextSearchResponse['hits']['hits']): SearchResult[] {
  return hits.map(hit => ({
    id: hit._source?.id || hit._id,
    category: hit._source?.category || 'unknown',
    text: hit._source?.text || '',
    score: hit._score,
    match_type: 'text' as const,
  }));
}

/**
 * Convert ES kNN search hits to SearchResults
 */
function knnHitsToResults(hits: KnnSearchResponse['hits']['hits']): SearchResult[] {
  return hits.map(hit => ({
    id: hit._source?.id || hit._id,
    category: hit._source?.category || 'unknown',
    text: hit._source?.text || '',
    score: hit._score,
    match_type: 'vector' as const,
  }));
}

/**
 * RRF (Reciprocal Rank Fusion) for combining text and vector results
 */
function rrfFusion(
  textResults: SearchResult[],
  vectorResults: SearchResult[],
  k: number,
  textWeight: number = 0.5,
  vectorWeight: number = 0.5
): SearchResult[] {
  const fused = new Map<string, { result: SearchResult; text_rank?: number; vector_rank?: number }>();

  // Assign ranks
  textResults.forEach((result, index) => {
    fused.set(result.id, { result, text_rank: index + 1 });
  });

  vectorResults.forEach((result, index) => {
    const existing = fused.get(result.id);
    if (existing) {
      existing.vector_rank = index + 1;
    } else {
      fused.set(result.id, { result, vector_rank: index + 1 });
    }
  });

  // Calculate RRF scores
  const scoredResults: SearchResult[] = [];

  fused.forEach(({ result, text_rank, vector_rank }) => {
    let rrfScore = 0;
    let match_type: 'text' | 'vector' | 'hybrid' = 'hybrid';

    if (text_rank !== undefined && vector_rank !== undefined) {
      const textScore = 1 / (60 + text_rank);
      const vectorScore = 1 / (60 + vector_rank);
      rrfScore = textScore * textWeight + vectorScore * vectorWeight;
    } else if (text_rank !== undefined) {
      rrfScore = (1 / (60 + text_rank)) * textWeight;
      match_type = 'text';
    } else if (vector_rank !== undefined) {
      rrfScore = (1 / (60 + vector_rank)) * vectorWeight;
      match_type = 'vector';
    }

    scoredResults.push({
      ...result,
      score: rrfScore,
      match_type,
    });
  });

  // Sort by score and take top k
  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.slice(0, k);
}

/**
 * Extract timing breakdown from ES profile
 */
function extractTimingBreakdown(
  profile: ESProfile,
  vectorSearchDuration: number,
  startTime: number
): TimingBreakdown {
  const breakdown: TimingBreakdown = {
    phase: 'Vector Search (kNN)',
    duration: vectorSearchDuration,
    start_offset: startTime,
  };

  if (profile.shards?.[0]?.searches?.[0]?.query) {
    for (const query of profile.shards[0].searches[0].query) {
      if (query.type === 'LanceKnnQuery' || query.type === 'LanceVectorQuery') {
        if (query.time_in_nanos) {
          breakdown.lance_vector_query_ms = (query.time_in_nanos / 1_000_000).toFixed(2);
          breakdown.query_type = query.type;
          breakdown.description = query.description;
          if (query.breakdown) {
            breakdown.breakdown = query.breakdown;
          }
        }
        break;
      }
    }
  }

  return breakdown;
}

/**
 * Perform hybrid search (BM25 text + Lance kNN vector) with RRF fusion
 */
export async function performHybridSearch(
  request: HybridSearchRequest
): Promise<HybridSearchResponse> {
  const startTime = Date.now();
  const timing_breakdown: TimingBreakdown[] = [];

  const {
    query_text,
    query_vector: provided_vector,
    k,
    text_weight = 0.5,
    vector_weight = 0.5,
    profile = true,
  } = request;

  let query_vector = provided_vector;
  let textResults: SearchResult[] = [];
  let vectorResults: SearchResult[] = [];
  let es_profile: any = null;

  // Generate embedding if not provided
  if (!query_vector) {
    const embedStart = Date.now();
    try {
      query_vector = await generateEmbedding(query_text);
      timing_breakdown.push({
        phase: 'Embedding Generation',
        duration: Date.now() - embedStart,
        start_offset: embedStart - startTime,
      });
    } catch (error: any) {
      return {
        success: false,
        results: [],
        text_results: 0,
        vector_results: 0,
        fusion_results: 0,
        query_text,
        error: error.message,
      };
    }
  }

  // Parallel text and vector search
  const [textSearch, vectorSearch] = await Promise.all([
    withSSLIgnore(() => performTextSearch(query_text, k * 2, profile)),
    withSSLIgnore(() => performKnnSearch({ query_vector, k, profile })),
  ]);

  // Process text results
  if (textSearch.hits?.hits) {
    textResults = textHitsToResults(textSearch.hits.hits);
  }

  // Process vector results
  if (vectorSearch.hits?.hits) {
    vectorResults = knnHitsToResults(vectorSearch.hits.hits);
    es_profile = vectorSearch.profile;
  }

  // Add timing for text search
  timing_breakdown.push({
    phase: 'Text Search (BM25)',
    duration: textSearch.took || 0,
    start_offset: 0, // Will be calculated properly in full implementation
  });

  // Add timing for vector search
  if (es_profile) {
    const vectorTiming = extractTimingBreakdown(
      es_profile,
      vectorSearch.took,
      0
    );
    timing_breakdown.push(vectorTiming);
  }

  // RRF fusion
  const fusionStart = Date.now();
  const fusedResults = rrfFusion(textResults, vectorResults, k, text_weight, vector_weight);

  timing_breakdown.push({
    phase: 'RRF Fusion',
    duration: Date.now() - fusionStart,
    start_offset: fusionStart - startTime,
  });

  const latency = Date.now() - startTime;

  return {
    success: true,
    results: fusedResults,
    text_results: textResults.length,
    vector_results: vectorResults.length,
    fusion_results: fusedResults.length,
    query_vector,
    query_text,
    latency: `${latency}ms`,
    timing_breakdown,
    es_profile,
  };
}

/**
 * Get a random vector from ES (for testing)
 */
export async function getRandomVector(): Promise<{ vector: number[]; dims: number }> {
  return withSSLIgnore(async () => {
    // Get any document to extract vector dimensions
    const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
      method: 'POST',
      headers: buildESHeaders(),
      body: JSON.stringify({
        size: 1,
        _source: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`ES search error: ${response.status}`);
    }

    const data = await response.json();

    // Generate random vector with same dimensions
    // (Since we can't extract dimensions from ES response easily)
    // Default to 768 dimensions (Jina embedding size)
    const dims = 768;
    const vector = Array.from({ length: dims }, () => Math.random() * 2 - 1);

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    const normalized = vector.map(v => v / magnitude);

    return { vector: normalized, dims };
  });
}
