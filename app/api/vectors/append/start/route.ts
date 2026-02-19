import { NextRequest, NextResponse } from "next/server";
import { resolvePythonBackendUrl } from "@/app/api/vectors/_python-backend";

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dataset = String(body.dataset || "").trim();
    if (!dataset) {
      return NextResponse.json(
        {
          success: false,
          error: "dataset is required",
        },
        { status: 400 }
      );
    }

    const vectors = clampPositiveInt(body.vectors, 10, 1, 10000);
    const targetShardIdRaw = body.target_shard_id ?? body.targetShardId;
    const targetShardId =
      targetShardIdRaw === null || targetShardIdRaw === undefined || targetShardIdRaw === ""
        ? undefined
        : Number.parseInt(String(targetShardIdRaw), 10);

    const backendUrl = resolvePythonBackendUrl(req);
    const response = await fetch(`${backendUrl}/api/v1/dataset/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset,
        vectors,
        target_shard_id: Number.isFinite(targetShardId) ? targetShardId : undefined,
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
      const status = response.status === 400 ? 400 : 502;
      return NextResponse.json(
        {
          success: false,
          error: `Python backend append failed: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 500)}` : ""}`,
        },
        { status }
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
      message: String(payload?.message || "Dataset append job started"),
      dataset,
      vectors,
      target_shard_id: Number.isFinite(targetShardId) ? targetShardId : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to start dataset append",
      },
      { status: 500 }
    );
  }
}

