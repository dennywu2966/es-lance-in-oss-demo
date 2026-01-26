import { NextRequest, NextResponse } from "next/server";

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
}

// Perform BM25 text search
async function performTextSearch(
  index: string,
  queryText: string,
  size: number
): Promise<{ results: HybridSearchResult[]; totalHits: number }> {
  const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
  const ES_AUTH = Buffer.from('elastic-admin:elastic-password').toString('base64');

  const response = await fetch(`${ES_HOST}/${index}/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${ES_AUTH}`,
    },
    body: JSON.stringify({
      query: {
        match: {
          text: queryText,
        },
      },
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
}

// Perform vector kNN search
async function performVectorSearch(
  index: string,
  queryVector: number[],
  k: number,
  numCandidates: number
): Promise<{ results: HybridSearchResult[]; totalHits: number }> {
  const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
  const ES_AUTH = Buffer.from('elastic-admin:elastic-password').toString('base64');

  const response = await fetch(`${ES_HOST}/${index}/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${ES_AUTH}`,
    },
    body: JSON.stringify({
      knn: {
        field: 'embedding',
        query_vector: queryVector,
        k,
        num_candidates: numCandidates,
      },
      size: k,
      _source: ['id', 'category', 'text'],
    }),
  });

  if (!response.ok) {
    throw new Error(`Vector search failed: ${response.statusText}`);
  }

  const data = await response.json();

  const results: HybridSearchResult[] = data.hits.hits.map((hit: any) => ({
    id: hit._source?.id || hit._id,
    category: hit._source?.category || 'unknown',
    text: hit._source?.text || '',
    score: hit._score || 0,
    matchType: 'vector' as const,
  }));

  return { results, totalHits: data.hits.total.value };
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

    // If no query vector provided, we can't do vector search
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

    // Perform text search if query text provided
    if (queryText) {
      const textSearch = await performTextSearch(ES_INDEX, queryText, k * 2);
      textResults = textSearch.results;
    }

    // Perform vector search if query vector provided
    if (queryVector) {
      const vectorSearch = await performVectorSearch(ES_INDEX, queryVector, k, numCandidates);
      vectorResults = vectorSearch.results;
    }

    // Perform fusion if both searches were performed
    if (queryText && queryVector) {
      fusionResults = rrfFusion(textResults, vectorResults, k, textWeight, vectorWeight);
    } else if (queryText) {
      fusionResults = textResults.slice(0, k);
    } else if (queryVector) {
      fusionResults = vectorResults.slice(0, k);
    }

    const latency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      results: fusionResults,
      textResults: textResults.length,
      vectorResults: vectorResults.length,
      fusionResults: fusionResults.length,
      queryText,
      queryVector,
      latency: `${latency}ms`,
    });
  } catch (error: any) {
    console.error('Hybrid search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Hybrid search failed',
      },
      { status: 500 }
    );
  }
}
