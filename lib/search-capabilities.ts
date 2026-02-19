export type PrefilterMode = 'none' | 'pushdown' | 'fallback';
export type RefreshState = 'fresh' | 'stale' | 'unknown';
export type ShardMode = 'NONE' | 'ES_ROUTING' | 'UNKNOWN';

export interface SearchEvidence {
  shard_mode: ShardMode;
  prefilter_mode: PrefilterMode;
  refresh_state: RefreshState;
  prefilter_reason?: string;
  nprobes?: number;
  nprobes_applied?: boolean;
}

export interface BuildEvidenceOptions {
  shardingStrategy?: string;
  prefilterMode: PrefilterMode;
  refreshState?: string;
  prefilterReason?: string;
  nprobes?: number;
  nprobesApplied?: boolean;
}

export interface PrefilterResolutionInput {
  filterProvided: boolean;
  filterApplied: boolean;
}

export function normalizeNprobes(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : undefined;
}

export function sanitizeFilter(filter: unknown): Record<string, unknown> | undefined {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return undefined;
  }
  const normalized = filter as Record<string, unknown>;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function resolvePrefilterMode(input: PrefilterResolutionInput): PrefilterMode {
  if (!input.filterProvided) {
    return 'none';
  }
  return input.filterApplied ? 'pushdown' : 'fallback';
}

export function normalizeRefreshState(refreshState?: string): RefreshState {
  const normalized = String(refreshState || 'unknown').toLowerCase();
  if (normalized === 'fresh') return 'fresh';
  if (normalized === 'stale') return 'stale';
  return 'unknown';
}

export function normalizeShardMode(shardingStrategy?: string): ShardMode {
  const normalized = String(shardingStrategy || '').toUpperCase();
  if (normalized === 'ES_ROUTING') return 'ES_ROUTING';
  if (normalized === 'NONE') return 'NONE';
  return 'UNKNOWN';
}

export function buildSearchEvidence(options: BuildEvidenceOptions): SearchEvidence {
  const evidence: SearchEvidence = {
    shard_mode: normalizeShardMode(options.shardingStrategy),
    prefilter_mode: options.prefilterMode,
    refresh_state: normalizeRefreshState(options.refreshState),
  };

  if (typeof options.prefilterReason === 'string' && options.prefilterReason.trim().length > 0) {
    evidence.prefilter_reason = options.prefilterReason;
  }

  if (typeof options.nprobes === 'number') {
    evidence.nprobes = options.nprobes;
  }

  if (typeof options.nprobesApplied === 'boolean') {
    evidence.nprobes_applied = options.nprobesApplied;
  }

  return evidence;
}

export function buildLanceKnnQuery(options: {
  queryVector: number[];
  k: number;
  numCandidates: number;
  filter?: Record<string, unknown>;
  nprobes?: number;
}): Record<string, unknown> {
  const lanceKnn: Record<string, unknown> = {
    field: 'embedding',
    query_vector: options.queryVector,
    k: options.k,
    num_candidates: options.numCandidates,
  };

  if (typeof options.nprobes === 'number') {
    lanceKnn.nprobes = options.nprobes;
  }

  if (options.filter) {
    return {
      bool: {
        must: [{ lance_knn: lanceKnn }],
        filter: [options.filter],
      },
    };
  }

  return { lance_knn: lanceKnn };
}
