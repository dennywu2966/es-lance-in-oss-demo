import { NextRequest, NextResponse } from "next/server";
import { resolvePythonBackendUrl } from "@/app/api/vectors/_python-backend";

interface RouteContext {
  params:
    | {
        jobId: string;
      }
    | Promise<{
    jobId: string;
      }>;
}

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { jobId } = await Promise.resolve(context.params);
    const resolvedJobId = String(jobId || "").trim();
    if (!resolvedJobId) {
      return NextResponse.json(
        {
          success: false,
          error: "jobId is required",
        },
        { status: 400 }
      );
    }

    const backendUrl = resolvePythonBackendUrl(req);
    const response = await fetch(`${backendUrl}/api/v1/dataset/status/${encodeURIComponent(resolvedJobId)}`, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text().catch(() => "");
    let payload: any = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      const status = response.status === 404 ? 404 : 502;
      return NextResponse.json(
        {
          success: false,
          error: `Python backend status failed: ${response.status}${text ? ` - ${text.slice(0, 500)}` : ""}`,
        },
        { status }
      );
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to get job status",
      },
      { status: 500 }
    );
  }
}
