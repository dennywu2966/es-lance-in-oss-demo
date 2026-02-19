/**
 * @jest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { deleteDatasetESIndex, deleteESIndex } from '@/lib/es-index-client';

describe('es-index-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('deletes dataset-specific ES index', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });

    const result = await deleteDatasetESIndex('Real_87K@Dims');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://127.0.0.1:9200/lance-ds-real-87k-dims',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
    expect(result).toMatchObject({
      success: true,
      index: 'lance-ds-real-87k-dims',
      status: 200,
      missing: false,
    });
  });

  it('treats missing ES index as successful cleanup', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'not found',
    });

    const result = await deleteESIndex('lance-ds-missing');

    expect(result).toMatchObject({
      success: true,
      index: 'lance-ds-missing',
      status: 404,
      missing: true,
    });
  });

  it('returns failure when ES delete responds with error', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom',
    });

    const result = await deleteESIndex('lance-ds-bad');

    expect(result).toMatchObject({
      success: false,
      index: 'lance-ds-bad',
      status: 500,
      error: 'boom',
    });
  });
});
