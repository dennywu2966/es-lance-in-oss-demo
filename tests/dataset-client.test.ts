/**
 * @jest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('dataset-client list cache policy', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses no-store when reading datasets via Next API', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, datasets: [], count: 0 }),
    });

    const { listDatasets } = await import('@/features/vector-mgmt/api/dataset-client');
    await listDatasets();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/vectors/list',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }),
      })
    );
  });

  it('sends append requests to same-origin append proxy endpoint', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, job_id: 'append-job-1', message: 'ok' }),
    });

    const { appendDataset } = await import('@/features/vector-mgmt/api/dataset-client');
    await appendDataset({
      dataset: 'vectors-10-dims-768-shards-4-es-routing-123',
      vectors: 6,
      target_shard_id: 2,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/vectors/append/start',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const [, options] = (global.fetch as unknown as jest.Mock).mock.calls[0];
    expect(String(options.body)).toContain('"dataset":"vectors-10-dims-768-shards-4-es-routing-123"');
    expect(String(options.body)).toContain('"target_shard_id":2');
  });

  it('fetches job status through same-origin status proxy endpoint', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-123', status: 'running', progress: 42 }),
    });

    const { getJobStatus } = await import('@/features/vector-mgmt/api/dataset-client');
    await getJobStatus('job-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/vectors/status/job-123',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }),
      })
    );
  });
});
