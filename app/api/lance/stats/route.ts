import { NextRequest, NextResponse } from "next/server";
import { compactError, fetchEs, resolveTargetIndex, withInsecureTls } from "@/app/api/lance/_shared";

function buildEmptyStats(index: string) {
  return {
    index,
    index_exists: false,
    refresh_state: "unknown",
    docs_count: 0,
    deleted_docs: 0,
    store_size_in_bytes: 0,
    refresh_interval: "1s",
    shard_count: 1,
    refresh_total: 0,
    refresh_total_time_ms: 0,
    note: "Index not found yet. Run backfill to ES first.",
  };
}

function isIndexNotFound(status: number, errorText: string): boolean {
  return status === 404 && errorText.includes("index_not_found_exception");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dataset = searchParams.get("dataset") || undefined;
    const explicitIndex = searchParams.get("index") || undefined;
    const index = resolveTargetIndex(dataset, explicitIndex);

    const result = await withInsecureTls(async () => {
      const settingsRes = await fetchEs(`/${encodeURIComponent(index)}/_settings/index.refresh_interval,index.number_of_shards`);
      if (!settingsRes.ok) {
        const errorText = await settingsRes.text();
        if (isIndexNotFound(settingsRes.status, errorText)) {
          return buildEmptyStats(index);
        }
        throw new Error(`Failed to fetch settings: ${settingsRes.status} ${compactError(errorText)}`);
      }

      const statsRes = await fetchEs(`/${encodeURIComponent(index)}/_stats/docs,refresh,store`);
      if (!statsRes.ok) {
        const errorText = await statsRes.text();
        if (isIndexNotFound(statsRes.status, errorText)) {
          return buildEmptyStats(index);
        }
        throw new Error(`Failed to fetch stats: ${statsRes.status} ${compactError(errorText)}`);
      }

      const settingsData = await settingsRes.json();
      const statsData = await statsRes.json();
      let lanceStats: Record<string, unknown> | null = null;
      const lanceStatsRes = await fetchEs(`/_lance/stats`);
      if (lanceStatsRes.ok) {
        lanceStats = await lanceStatsRes.json();
      }

      const indexSettings = settingsData?.[index]?.settings?.index || {};
      const indexStats = statsData?.indices?.[index]?.total || {};
      const refresh = indexStats?.refresh || {};
      const docs = indexStats?.docs || {};
      const store = indexStats?.store || {};

      const refreshState = (refresh.total || 0) > 0 ? "fresh" : "stale";

      return {
        index,
        refresh_state: refreshState,
        docs_count: docs.count || 0,
        deleted_docs: docs.deleted || 0,
        store_size_in_bytes: store.size_in_bytes || 0,
        refresh_interval: indexSettings.refresh_interval || "1s",
        shard_count: Number(indexSettings.number_of_shards || 1),
        refresh_total: refresh.total || 0,
        refresh_total_time_ms: refresh.total_time_in_millis || 0,
        lance_cache_size: Number((lanceStats as any)?.cache?.size || 0),
        lance_cache_max_size: Number((lanceStats as any)?.cache?.max_size || 0),
        lance_memory_mb: Number((lanceStats as any)?.memory?.allocated_mb || 0),
        lance_health: String((lanceStats as any)?.health || "UNKNOWN"),
        lance_refresh_supported: Boolean(lanceStats),
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
        error: error?.message || "Failed to get Lance stats",
      },
      { status: 500 }
    );
  }
}
