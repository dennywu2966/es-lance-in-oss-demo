/**
 * Search entity types and interfaces
 */

export interface KnnSearchRequest {
  query_vector: number[];
  k: number;
  num_candidates?: number;
  profile?: boolean;
}

export interface KnnSearchResponse {
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
  profile?: ESProfile;
}

export interface HybridSearchRequest {
  query_text: string;
  query_vector?: number[];
  k: number;
  text_weight?: number;
  vector_weight?: number;
  profile?: boolean;
}

export interface HybridSearchResponse {
  success: boolean;
  results: SearchResult[];
  text_results: number;
  vector_results: number;
  fusion_results: number;
  query_vector?: number[];
  query_text: string;
  latency?: string;
  timing_breakdown?: TimingBreakdown[];
  es_profile?: any;
}

export interface SearchResult {
  id: string;
  category: string;
  text: string;
  score: number;
  match_type: 'text' | 'vector' | 'hybrid';
}

export interface TimingBreakdown {
  phase: string;
  duration: number;
  start_offset: number;
  lance_vector_query_ms?: string;
  breakdown?: any;
}

export interface ESProfile {
  shards: Array<{
    id: string;
    searches: Array<{
      query: Array<{
        type: string;
        description?: string;
        time_in_nanos: number;
        breakdown?: { [key: string]: number };
        debug?: { [key: string]: number | string };
      }>;
    }>;
  }>;
}

export interface TextSearchResponse {
  hits: {
    hits: Array<{
      _id: string;
      _score: number;
      _source: {
        id?: string;
        category?: string;
        text?: string;
      };
    }>;
    total: { value: number };
  };
}

export interface EmbeddingRequest {
  text: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  dims: number;
}
