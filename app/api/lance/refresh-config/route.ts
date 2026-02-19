import { NextRequest, NextResponse } from "next/server";
import { compactError, fetchEs, resolveTargetIndex, withInsecureTls } from "@/app/api/lance/_shared";

function isValidRefreshInterval(value: string): boolean {
  return /^-1$|^[0-9]+(ms|s|m|h|d)$/.test(value);
}

async function getRefreshConfig(index: string): Promise<{
  index: string;
  refresh_interval: string;
  shard_count: number;
}> {
  return await withInsecureTls(async () => {
    const settingsRes = await fetchEs(`/${encodeURIComponent(index)}/_settings/index.refresh_interval,index.number_of_shards`);
    if (!settingsRes.ok) {
      const errorText = await settingsRes.text();
      throw new Error(`Failed to fetch refresh config: ${settingsRes.status} ${compactError(errorText)}`);
    }
    const settingsData = await settingsRes.json();
    const indexSettings = settingsData?.[index]?.settings?.index || {};

    return {
      index,
      refresh_interval: indexSettings.refresh_interval || "1s",
      shard_count: Number(indexSettings.number_of_shards || 1),
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dataset = searchParams.get("dataset") || undefined;
    const explicitIndex = searchParams.get("index") || undefined;
    const index = resolveTargetIndex(dataset, explicitIndex);

    const config = await getRefreshConfig(index);
    return NextResponse.json({ success: true, ...config });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to get refresh config",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const dataset = typeof body.dataset === "string" ? body.dataset : undefined;
    const explicitIndex = typeof body.index === "string" ? body.index : undefined;
    const refreshInterval = String(body.refresh_interval || body.refreshInterval || "").trim();

    if (!refreshInterval || !isValidRefreshInterval(refreshInterval)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid refresh_interval. Use values like 500ms, 1s, 30s, 1m, or -1.",
        },
        { status: 400 }
      );
    }

    const index = resolveTargetIndex(dataset, explicitIndex);

    await withInsecureTls(async () => {
      const putRes = await fetchEs(`/${encodeURIComponent(index)}/_settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: {
            refresh_interval: refreshInterval,
          },
        }),
      });

      if (!putRes.ok) {
        const errorText = await putRes.text();
        throw new Error(`Failed to update refresh config: ${putRes.status} ${compactError(errorText)}`);
      }
    });

    const config = await getRefreshConfig(index);
    return NextResponse.json({
      success: true,
      ...config,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to update refresh config",
      },
      { status: 500 }
    );
  }
}
