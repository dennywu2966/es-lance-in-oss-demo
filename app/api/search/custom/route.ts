import { ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";
import { NextRequest, NextResponse } from "next/server";

interface CustomSearchRequest {
  query: any;
  esEndpoint?: string;
  esIndex?: string;
}

interface CustomSearchResponse {
  success: boolean;
  results?: any;
  totalHits?: number;
  latency?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json() as CustomSearchRequest;
    const { query, esIndex } = body;

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Query body is required',
        },
        { status: 400 }
      );
    }

    const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
    const ES_AUTH = CONFIG_ES_AUTH;
    const ES_INDEX = esIndex || process.env.ES_INDEX || 'lance-validation-test';

    // Execute the custom query against Elasticsearch
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ES_SECURITY_ENABLED) {
      headers['Authorization'] = `Basic ${ES_AUTH}`;
    }

    const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: `Elasticsearch error: ${response.status} - ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      results: data,
      totalHits: data.hits?.total?.value || 0,
      latency: `${latency}ms`,
    });
  } catch (error: any) {
    console.error('Custom search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Custom search failed',
      },
      { status: 500 }
    );
  }
}
