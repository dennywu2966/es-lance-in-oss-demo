export type ShardingStrategy = 'NONE' | 'ES_ROUTING';

export interface DatasetProfileInput {
  dims?: number;
  shardCount?: number;
  shardingStrategy?: string;
  shardPath?: string;
  datasetName?: string;
  uriPrefix?: string;
  fieldMapping?: string;
}

export interface DatasetProfile {
  dims: number;
  shardCount: number;
  shardingStrategy: ShardingStrategy;
  shardPath?: string;
  datasetName?: string;
  uriPrefix?: string;
  fieldMapping?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.floor(fallback));
  }
  return Math.max(1, Math.floor(parsed));
}

export function normalizeShardingStrategy(input?: string): ShardingStrategy {
  const normalized = String(input || 'NONE').toUpperCase();
  return normalized === 'ES_ROUTING' ? 'ES_ROUTING' : 'NONE';
}

export function datasetIndexName(datasetName: string): string {
  const sanitized = String(datasetName || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `lance-ds-${sanitized || 'unknown'}`;
}

export function resolveSearchIndex(
  dataset?: string,
  explicitIndex?: string,
  defaultIndex: string = 'lance-validation-test'
): string {
  if (explicitIndex && explicitIndex.trim().length > 0) {
    return explicitIndex.trim();
  }
  if (dataset && dataset.trim().length > 0) {
    return datasetIndexName(dataset);
  }
  return defaultIndex;
}

function readProfileValue<T = unknown>(
  metadata: Record<string, unknown>,
  request: DatasetProfileInput,
  snakeKey: string,
  camelKey: keyof DatasetProfileInput
): T | undefined {
  if (snakeKey in metadata) {
    return metadata[snakeKey] as T;
  }
  const metadataCamel = camelKey as string;
  if (metadataCamel in metadata) {
    return metadata[metadataCamel] as T;
  }
  return request[camelKey] as T | undefined;
}

export function resolveDatasetProfile(input: {
  request?: DatasetProfileInput;
  metadata?: unknown;
  defaults?: {
    dims?: number;
    shardCount?: number;
    shardingStrategy?: ShardingStrategy;
  };
}): DatasetProfile {
  const request = input.request || {};
  const metadata = asRecord(input.metadata);
  const defaults = input.defaults || {};

  const dimsFallback = normalizePositiveInt(defaults.dims ?? 768, 768);
  const shardFallback = normalizePositiveInt(defaults.shardCount ?? 1, 1);
  const strategyFallback = defaults.shardingStrategy ?? 'NONE';

  const dimsValue = readProfileValue<number>(metadata, request, 'dims', 'dims');
  const shardCountValue = readProfileValue<number>(metadata, request, 'shard_count', 'shardCount');
  const shardingStrategyValue = readProfileValue<string>(metadata, request, 'sharding_strategy', 'shardingStrategy');
  const shardPathValue = readProfileValue<string>(metadata, request, 'shard_path', 'shardPath');
  const datasetNameValue = readProfileValue<string>(metadata, request, 'dataset_name', 'datasetName');
  const uriPrefixValue = readProfileValue<string>(metadata, request, 'uri_prefix', 'uriPrefix');
  const fieldMappingValue = readProfileValue<string>(metadata, request, 'field_mapping', 'fieldMapping');

  return {
    dims: normalizePositiveInt(dimsValue, dimsFallback),
    shardCount: normalizePositiveInt(shardCountValue, shardFallback),
    shardingStrategy: normalizeShardingStrategy(shardingStrategyValue || strategyFallback),
    shardPath: pickString(shardPathValue),
    datasetName: pickString(datasetNameValue),
    uriPrefix: pickString(uriPrefixValue),
    fieldMapping: pickString(fieldMappingValue),
  };
}
