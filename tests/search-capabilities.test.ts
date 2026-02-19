/**
 * @jest-environment node
 */

import {
  buildLanceKnnQuery,
  buildSearchEvidence,
  normalizeNprobes,
  resolvePrefilterMode,
  sanitizeFilter,
} from '@/lib/search-capabilities';

describe('search capabilities helpers', () => {
  it('normalizes nprobes to a positive integer', () => {
    expect(normalizeNprobes(16)).toBe(16);
    expect(normalizeNprobes('32')).toBe(32);
    expect(normalizeNprobes(0)).toBeUndefined();
    expect(normalizeNprobes(-5)).toBeUndefined();
    expect(normalizeNprobes('abc')).toBeUndefined();
  });

  it('sanitizes filter payloads', () => {
    expect(sanitizeFilter({ term: { category: 'ai' } })).toEqual({ term: { category: 'ai' } });
    expect(sanitizeFilter({})).toBeUndefined();
    expect(sanitizeFilter(null)).toBeUndefined();
    expect(sanitizeFilter('bad-filter')).toBeUndefined();
  });

  it('resolves prefilter mode from runtime behavior', () => {
    expect(resolvePrefilterMode({ filterProvided: false, filterApplied: false })).toBe('none');
    expect(resolvePrefilterMode({ filterProvided: true, filterApplied: true })).toBe('pushdown');
    expect(resolvePrefilterMode({ filterProvided: true, filterApplied: false })).toBe('fallback');
  });

  it('builds evidence envelope for UI rendering', () => {
    const evidence = buildSearchEvidence({
      shardingStrategy: 'ES_ROUTING',
      prefilterMode: 'fallback',
      refreshState: 'stale',
      nprobes: 20,
      nprobesApplied: false,
      prefilterReason: 'query_parse_exception',
    });

    expect(evidence.shard_mode).toBe('ES_ROUTING');
    expect(evidence.prefilter_mode).toBe('fallback');
    expect(evidence.refresh_state).toBe('stale');
    expect(evidence.nprobes).toBe(20);
    expect(evidence.nprobes_applied).toBe(false);
    expect(evidence.prefilter_reason).toBe('query_parse_exception');
  });

  it('builds lance_knn query with filter and nprobes', () => {
    const query = buildLanceKnnQuery({
      queryVector: [0.1, 0.2],
      k: 5,
      numCandidates: 10,
      filter: { term: { category: 'ai' } },
      nprobes: 8,
    });

    expect(query).toEqual({
      bool: {
        must: [
          {
            lance_knn: {
              field: 'embedding',
              query_vector: [0.1, 0.2],
              k: 5,
              num_candidates: 10,
              nprobes: 8,
            },
          },
        ],
        filter: [{ term: { category: 'ai' } }],
      },
    });
  });
});
