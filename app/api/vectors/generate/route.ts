import { NextRequest, NextResponse } from "next/server";
import { resolvePythonBackendUrl } from "@/app/api/vectors/_python-backend";

type ShardingStrategy = "NONE" | "ES_ROUTING";

function normalizeShardingStrategy(value: unknown): ShardingStrategy {
  return String(value || "NONE").toUpperCase() === "ES_ROUTING" ? "ES_ROUTING" : "NONE";
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseTimeoutMs(): number {
  const raw = Number(process.env.DATASET_GENERATE_SYNC_TIMEOUT_MS || 600000);
  if (!Number.isFinite(raw) || raw < 5000) return 600000;
  return Math.floor(raw);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const vectors = clampPositiveInt(body.vectors, 100, 10, 10000);
    const dims = clampPositiveInt(body.dims, 10, 2, 4096);
    const shardCount = clampPositiveInt(body.shards ?? body.shard_count ?? body.shardCount ?? 1, 1, 1, 32);
    const shardingStrategy = normalizeShardingStrategy(body.sharding_strategy ?? body.shardingStrategy);
    const pythonBackendUrl = resolvePythonBackendUrl(req);

    const generateResponse = await fetch(`${pythonBackendUrl}/api/v1/dataset/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors,
        dims,
        shard_count: shardCount,
        sharding_strategy: shardingStrategy,
      }),
    });

    if (!generateResponse.ok) {
      const bodyText = await generateResponse.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: `Python backend generate failed: ${generateResponse.status}${bodyText ? ` - ${bodyText}` : ""}`,
        },
        { status: 502 }
      );
    }

    const generateJson = await generateResponse.json();
    const jobId = String(generateJson?.job_id || "");
    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: "Python backend did not return job_id",
        },
        { status: 502 }
      );
    }

    const timeoutMs = parseTimeoutMs();
    const pollIntervalMs = 1500;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const statusResponse = await fetch(`${pythonBackendUrl}/api/v1/dataset/status/${jobId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!statusResponse.ok) {
        const bodyText = await statusResponse.text().catch(() => "");
        return NextResponse.json(
          {
            success: false,
            error: `Python backend status check failed: ${statusResponse.status}${bodyText ? ` - ${bodyText}` : ""}`,
            job_id: jobId,
          },
          { status: 502 }
        );
      }

      const statusJson = await statusResponse.json();
      const status = String(statusJson?.status || "").toLowerCase();

      if (status === "completed") {
        const result = statusJson?.result || {};
        const dataset = String(result.dataset_name || "");
        if (!dataset) {
          return NextResponse.json(
            {
              success: false,
              error: "Generation completed but dataset_name is missing",
              job_id: jobId,
            },
            { status: 502 }
          );
        }

        const resolvedVectors = clampPositiveInt(result.vectors, vectors, 1, Number.MAX_SAFE_INTEGER);
        const resolvedDims = clampPositiveInt(result.dims, dims, 1, 4096);
        const resolvedShardCount = clampPositiveInt(result.shard_count, shardCount, 1, 32);
        const resolvedStrategy = normalizeShardingStrategy(result.sharding_strategy || shardingStrategy);

        return NextResponse.json({
          success: true,
          dataset,
          vectors: resolvedVectors,
          dims: resolvedDims,
          shardCount: resolvedShardCount,
          shards: resolvedShardCount,
          shardingStrategy: resolvedStrategy,
          uploadTime: Date.now() - startTime,
          job_id: jobId,
        });
      }

      if (status === "failed") {
        return NextResponse.json(
          {
            success: false,
            error: statusJson?.error || "Dataset generation failed",
            job_id: jobId,
          },
          { status: 500 }
        );
      }

      await sleep(pollIntervalMs);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Dataset generation timed out while waiting for completion",
        job_id: jobId,
      },
      { status: 504 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Dataset generation failed",
        vectors: 0,
        dims: 0,
      },
      { status: 500 }
    );
  }
}
