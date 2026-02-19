import { NextRequest } from "next/server";
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
  const { jobId } = await Promise.resolve(context.params);
  const resolvedJobId = String(jobId || "").trim();
  if (!resolvedJobId) {
    return new Response(JSON.stringify({ success: false, error: "jobId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const backendUrl = resolvePythonBackendUrl(req);
  const upstream = await fetch(`${backendUrl}/api/v1/dataset/stream/${encodeURIComponent(resolvedJobId)}`, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({
        success: false,
        error: `Python backend stream failed: ${upstream.status}${errorText ? ` - ${errorText.slice(0, 500)}` : ""}`,
      }),
      {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
