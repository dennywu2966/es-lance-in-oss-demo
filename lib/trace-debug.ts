import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";

export interface LanceStorageConfigView {
  uri?: string;
  uri_prefix?: string;
  shard_path?: string;
  dataset_name?: string;
  sharding_strategy?: string;
  lance_id_column?: string;
  lance_vector_column?: string;
}

export interface TraceDebugPayload {
  debug_enabled: boolean;
  es_index: string;
  shard_ids: number[];
  shard_count: number;
  oss_queries: Array<{
    shard_id: number;
    uri: string;
  }>;
  storage?: LanceStorageConfigView | null;
  profile_snapshot?: unknown;
  request_attempts?: Array<{
    stage: string;
    request_body: unknown;
    status?: string;
    error?: string;
  }>;
}

export function isTraceDebugEnabled(): boolean {
  const raw = String(process.env.LANCE_TRACE_DEBUG || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function safeTraceJson(value: unknown, maxChars: number = 12000): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (!serialized) {
      return "";
    }
    if (serialized.length <= maxChars) {
      return serialized;
    }
    return `${serialized.slice(0, maxChars)}\n...<truncated>`;
  } catch (error: any) {
    return `<json_error:${error?.message || "unknown"}>`;
  }
}

export function extractProfileShardIds(profile: any): number[] {
  const shards = Array.isArray(profile?.shards) ? profile.shards : [];
  const shardSet = new Set<number>();
  for (const shard of shards) {
    const raw = shard?.id;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      shardSet.add(Math.floor(parsed));
    }
  }
  return Array.from(shardSet).sort((a, b) => a - b);
}

export function resolveLanceUriForShard(
  storage: LanceStorageConfigView | null | undefined,
  indexName: string,
  shardId: number
): string | null {
  if (!storage) {
    return null;
  }

  if (storage.uri_prefix) {
    const shardPathTemplate = storage.shard_path || "";
    const shardPath = shardPathTemplate
      .replaceAll("{index}", indexName)
      .replaceAll("{shard_id}", String(shardId));

    const normalizedPrefix = storage.uri_prefix.replace(/\/+$/, "");
    const normalizedDatasetName = (storage.dataset_name || "data.lance").replace(/^\/+/, "");
    if (!shardPath) {
      return `${normalizedPrefix}/${normalizedDatasetName}`;
    }
    if (shardPath.endsWith(".lance")) {
      return `${normalizedPrefix}/${shardPath.replace(/^\/+/, "")}`;
    }
    return `${normalizedPrefix}/${shardPath.replace(/^\/+/, "")}/${normalizedDatasetName}`;
  }

  if (storage.uri) {
    return storage.uri;
  }

  return null;
}

export async function fetchLanceStorageConfigFromMapping(indexName: string): Promise<LanceStorageConfigView | null> {
  const esHost = (process.env.ES_HOST || CONFIG_ES_HOST || "https://127.0.0.1:9200").replace(/\/$/, "");
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  try {
    const headers: Record<string, string> = {};
    if (ES_SECURITY_ENABLED) {
      headers.Authorization = `Basic ${CONFIG_ES_AUTH}`;
    }

    const response = await fetch(`${esHost}/${encodeURIComponent(indexName)}/_mapping`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    const root = body?.[indexName] || Object.values(body || {})[0];
    const storage = root?.mappings?.properties?.embedding?.storage;
    if (!storage || typeof storage !== "object") {
      return null;
    }
    return storage as LanceStorageConfigView;
  } catch {
    return null;
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

export async function buildTraceDebugPayload(options: {
  esIndex: string;
  profile?: any;
  requestAttempts?: Array<{
    stage: string;
    requestBody: unknown;
    status?: string;
    error?: string;
  }>;
}): Promise<TraceDebugPayload> {
  const shardIds = extractProfileShardIds(options.profile);
  const storage = await fetchLanceStorageConfigFromMapping(options.esIndex);
  const targetShardIds = shardIds.length > 0 ? shardIds : [0];
  const ossQueries: Array<{ shard_id: number; uri: string }> = [];

  for (const shardId of targetShardIds) {
    const resolved = resolveLanceUriForShard(storage, options.esIndex, shardId);
    if (resolved) {
      ossQueries.push({ shard_id: shardId, uri: resolved });
    }
  }

  const profileSnapshot = Array.isArray(options.profile?.shards)
    ? options.profile.shards.map((shard: any) => ({
        id: shard?.id,
        query: Array.isArray(shard?.searches?.[0]?.query)
          ? shard.searches[0].query.map((query: any) => ({
              type: query?.type,
              description: query?.description,
              time_in_nanos: query?.time_in_nanos,
              debug: query?.debug || {},
            }))
          : [],
      }))
    : [];

  return {
    debug_enabled: true,
    es_index: options.esIndex,
    shard_ids: shardIds,
    shard_count: shardIds.length,
    oss_queries: ossQueries,
    storage,
    profile_snapshot: profileSnapshot,
    request_attempts: (options.requestAttempts || []).map((item) => ({
      stage: item.stage,
      request_body: item.requestBody,
      status: item.status,
      error: item.error,
    })),
  };
}
