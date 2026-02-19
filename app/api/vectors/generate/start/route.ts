import { NextRequest, NextResponse } from "next/server";
import { resolvePythonBackendUrl } from "@/app/api/vectors/_python-backend";

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeShardingStrategy(value: unknown): "NONE" | "ES_ROUTING" {
  return String(value || "NONE").toUpperCase() === "ES_ROUTING" ? "ES_ROUTING" : "NONE";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const vectors = clampPositiveInt(body.vectors, 100, 1, 10000);
    const dims = clampPositiveInt(body.dims, 768, 1, 4096);
    const shardCount = clampPositiveInt(body.shards ?? body.shard_count ?? body.shardCount ?? 1, 1, 1, 32);
    const shardingStrategy = normalizeShardingStrategy(body.sharding_strategy ?? body.shardingStrategy);

    const backendUrl = resolvePythonBackendUrl(req);
    const response = await fetch(`${backendUrl}/api/v1/dataset/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors,
        dims,
        shard_count: shardCount,
        sharding_strategy: shardingStrategy,
      }),
      cache: "no-store",
    });

    const bodyText = await response.text().catch(() => "");
    let payload: any = {};
    if (bodyText) {
      try {
        payload = JSON.parse(bodyText);
      } catch {
        payload = { message: bodyText };
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Python backend generate failed: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 500)}` : ""}`,
        },
        { status: 502 }
      );
    }

    const jobId = String(payload?.job_id || "");
    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: "Python backend did not return job_id",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      message: String(payload?.message || "Dataset generation job started"),
      vectors,
      dims,
      shard_count: shardCount,
      sharding_strategy: shardingStrategy,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to start dataset generation",
      },
      { status: 500 }
    );
  }
}

