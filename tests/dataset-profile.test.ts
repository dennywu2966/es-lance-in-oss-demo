/**
 * @jest-environment node
 */

import {
  datasetIndexName,
  normalizeShardingStrategy,
  resolveDatasetProfile,
  resolveSearchIndex,
} from '@/lib/dataset-profile';

describe('dataset profile helpers', () => {
  it('normalizes sharding strategy to allowed values', () => {
    expect(normalizeShardingStrategy('es_routing')).toBe('ES_ROUTING');
    expect(normalizeShardingStrategy('invalid')).toBe('NONE');
    expect(normalizeShardingStrategy(undefined)).toBe('NONE');
  });

  it('uses metadata profile over request values when available', () => {
    const profile = resolveDatasetProfile({
      request: {
        dims: 768,
        shardCount: 1,
        shardingStrategy: 'NONE',
      },
      metadata: {
        dims: 1536,
        shard_count: 4,
        sharding_strategy: 'ES_ROUTING',
        shard_path: 'idx/shard-{shard_id}',
        dataset_name: 'data.lance',
      },
    });

    expect(profile.dims).toBe(1536);
    expect(profile.shardCount).toBe(4);
    expect(profile.shardingStrategy).toBe('ES_ROUTING');
    expect(profile.shardPath).toBe('idx/shard-{shard_id}');
    expect(profile.datasetName).toBe('data.lance');
  });

  it('falls back to normalized request values when metadata is missing', () => {
    const profile = resolveDatasetProfile({
      request: {
        dims: 0,
        shardCount: 2.9,
        shardingStrategy: 'none',
      },
    });

    expect(profile.dims).toBe(768);
    expect(profile.shardCount).toBe(2);
    expect(profile.shardingStrategy).toBe('NONE');
  });

  it('builds dataset-specific index names for search', () => {
    expect(datasetIndexName('Real_87K@Dims')).toBe('lance-ds-real-87k-dims');
    expect(resolveSearchIndex('real-87k', undefined, 'lance-validation-test')).toBe('lance-ds-real-87k');
    expect(resolveSearchIndex(undefined, 'custom-index', 'lance-validation-test')).toBe('custom-index');
    expect(resolveSearchIndex(undefined, undefined, 'lance-validation-test')).toBe('lance-validation-test');
  });
});
