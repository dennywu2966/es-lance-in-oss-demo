import { NextRequest, NextResponse } from "next/server";
import { compactError, fetchEs, resolveTargetIndex, withInsecureTls } from "@/app/api/lance/_shared";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dataset = typeof body.dataset === "string" ? body.dataset : undefined;
    const explicitIndex = typeof body.index === "string" ? body.index : undefined;
    const index = resolveTargetIndex(dataset, explicitIndex);

    const result = await withInsecureTls(async () => {
      const lanceRefreshRes = await fetchEs(`/_lance/refresh`, {
        method: "POST",
      });
      if (!lanceRefreshRes.ok) {
        const errorText = await lanceRefreshRes.text();
        throw new Error(`Failed to trigger Lance cache refresh: ${lanceRefreshRes.status} ${compactError(errorText)}`);
      }

      const refreshRes = await fetchEs(`/${encodeURIComponent(index)}/_refresh`, {
        method: "POST",
      });
      if (!refreshRes.ok) {
        const errorText = await refreshRes.text();
        throw new Error(`Failed to refresh index: ${refreshRes.status} ${compactError(errorText)}`);
      }
      const refreshData = await refreshRes.json();

      const statsRes = await fetchEs(`/${encodeURIComponent(index)}/_stats/refresh`);
      let refreshTotal = 0;
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        refreshTotal = statsData?.indices?.[index]?.total?.refresh?.total || 0;
      }

      return {
        index,
        refresh_state: "fresh",
        cache_invalidated: true,
        refresh_total: refreshTotal,
        shards: refreshData?._shards || {},
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to refresh Lance index",
      },
      { status: 500 }
    );
  }
}
