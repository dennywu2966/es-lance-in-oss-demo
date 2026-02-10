import { NextRequest, NextResponse } from "next/server";

interface TextSearchRequest {
  query: string;
  k?: number;
  profile?: boolean;
  dataset?: string;
}

interface TextSearchResponse {
  success: boolean;
  results?: Array<{
    id: string;
    category: string;
    text: string;
    score: number;
  }>;
  totalHits?: number;
  error?: string;
  timing?: any;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as TextSearchRequest;
    const { query, k = 10, profile = false } = body;

    // For now, return empty results since we don't have documents indexed in ES
    // In a full implementation, this would query ES for BM25 text search
    return NextResponse.json({
      success: true,
      results: [],
      totalHits: 0,
    } as TextSearchResponse);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Text search failed",
      },
      { status: 500 }
    );
  }
}
