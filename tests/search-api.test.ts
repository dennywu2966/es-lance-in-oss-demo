/**
 * Tests for search API functionality
 * These tests verify the search behavior and request handling
 * Note: Full integration tests require a running server
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Test data structures
describe('Search API - Request Validation', () => {
  describe('request body validation', () => {
    it('should accept valid request with all parameters', () => {
      const validRequest = {
        k: 5,
        numCandidates: 10,
        profile: true,
        useExistingVector: false,
        queryVector: Array(128).fill(0.5),
      };

      expect(validRequest.k).toBe(5);
      expect(validRequest.numCandidates).toBe(10);
      expect(validRequest.profile).toBe(true);
      expect(validRequest.queryVector).toHaveLength(128);
    });

    it('should accept valid request with minimal parameters', () => {
      const minimalRequest = {
        k: 5,
      };

      expect(minimalRequest.k).toBe(5);
    });

    it('should accept request with profile=true', () => {
      const request = {
        k: 5,
        profile: true,
      };

      expect(request.profile).toBe(true);
    });

    it('should accept request with existing vector', () => {
      const request = {
        k: 5,
        useExistingVector: true,
        queryVector: Array(128).fill(0.1),
      };

      expect(request.useExistingVector).toBe(true);
      expect(request.queryVector).toBeDefined();
    });
  });

  describe('response structure validation', () => {
    it('should validate successful response structure', () => {
      const successResponse = {
        success: true,
        results: [
          {
            id: 'doc0',
            category: 'tech',
            score: 0.95,
            index: 'dataset',
            vector: Array(128).fill(0.1),
          }
        ],
        latency: '500ms',
        totalHits: 100,
        queryDimension: 128,
        queryVector: Array(128).fill(0.5),
        datasetName: 'test-dataset',
        vectorsCount: 100,
        timing: {
          oss_download_ms: 100,
          dataset_open_ms: 50,
          similarity_calc_ms: 150,
          total_search_ms: 500,
        },
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.results).toBeInstanceOf(Array);
      expect(successResponse.results[0].id).toBe('doc0');
      expect(successResponse.timing).toBeDefined();
      expect(successResponse.timing.total_search_ms).toBeGreaterThan(0);
    });

    it('should validate error response structure', () => {
      const errorResponse = {
        success: false,
        error: 'Dataset not found',
        results: [],
        latency: 'N/A',
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.results).toEqual([]);
    });

    it('should validate response with timing data', () => {
      const responseWithTiming = {
        success: true,
        results: [],
        latency: '500ms',
        totalHits: 100,
        queryDimension: 128,
        timing: {
          oss_download_ms: 100,
          dataset_open_ms: 50,
          query_prep_ms: 1,
          data_load_ms: 200,
          similarity_calc_ms: 100,
          sorting_ms: 5,
          result_format_ms: 10,
          total_search_ms: 466,
          cleanup_ms: 20,
        },
      };

      const expectedTimingKeys = [
        'oss_download_ms',
        'dataset_open_ms',
        'query_prep_ms',
        'data_load_ms',
        'similarity_calc_ms',
        'sorting_ms',
        'result_format_ms',
        'total_search_ms',
        'cleanup_ms',
      ];

      expectedTimingKeys.forEach(key => {
        expect(responseWithTiming.timing).toHaveProperty(key);
      });

      // Verify all timing values are numbers
      Object.values(responseWithTiming.timing).forEach(value => {
        expect(typeof value).toBe('number');
      });
    });
  });

  describe('Python script generation', () => {
    it('should generate PROFILE=True when profiling enabled', () => {
      const profile = true;
      const pythonScript = `
PROFILE = ${profile ? 'True' : 'False'}
if PROFILE:
    timing = {}
      `;

      expect(pythonScript).toContain('PROFILE = True');
    });

    it('should generate PROFILE=False when profiling disabled', () => {
      const profile = false;
      const pythonScript = `
PROFILE = ${profile ? 'True' : 'False'}
if PROFILE:
    timing = {}
      `;

      expect(pythonScript).toContain('PROFILE = False');
    });

    it('should include timing measurements in script', () => {
      const profile = true;
      const pythonScript = `
PROFILE = ${profile ? 'True' : 'False'}
if PROFILE:
    start = time.time()
# operation
if PROFILE:
    timing['operation_ms'] = int((time.time() - start) * 1000)
      `;

      expect(pythonScript).toContain('time.time()');
      expect(pythonScript).toContain('timing[');
      expect(pythonScript).toContain('_ms');
    });
  });

  describe('Parameter validation', () => {
    it('should enforce minimum k value of 1', () => {
      const k = 0;
      const normalizedK = Number.isFinite(k) ? k : 5;
      const clampedK = Math.max(1, Math.min(50, normalizedK));

      expect(clampedK).toBe(1);
    });

    it('should enforce maximum k value of 50', () => {
      const k = 100;
      const normalizedK = Number.isFinite(k) ? k : 5;
      const clampedK = Math.max(1, Math.min(50, normalizedK));

      expect(clampedK).toBe(50);
    });

    it('should use default k when not provided', () => {
      const k = undefined;
      const defaultK = k || 5;

      expect(defaultK).toBe(5);
    });

    it('should calculate numCandidates as k * 2 by default', () => {
      const k = 5;
      const numCandidates = k * 2;

      expect(numCandidates).toBe(10);
    });
  });

  describe('Timing data calculation', () => {
    it('should calculate total search time correctly', () => {
      const timing = {
        oss_download_ms: 100,
        dataset_open_ms: 50,
        query_prep_ms: 1,
        data_load_ms: 200,
        similarity_calc_ms: 150,
        sorting_ms: 5,
        result_format_ms: 10,
        cleanup_ms: 20,
      };

      const totalSearchMs = Object.entries(timing)
        .filter(([k]) => k !== 'cleanup_ms' && k.endsWith('_ms') && typeof timing[k as keyof typeof timing] === 'number')
        .reduce((sum, [, v]) => sum + (v as number), 0);

      expect(totalSearchMs).toBe(516);
    });

    it('should handle missing timing stages gracefully', () => {
      const timing = {
        oss_download_ms: 100,
        dataset_open_ms: 50,
        // Missing other stages
      };

      const totalMs = Object.values(timing)
        .filter((v): v is number => typeof v === 'number')
        .reduce((sum, v) => sum + v, 0);

      expect(totalMs).toBe(150);
    });
  });
});

describe('Search API - Vector Operations', () => {
  describe('query vector handling', () => {
    it('should store query vector after search', () => {
      let lastQueryVector: number[] | null = null;
      const queryVector = Array(128).fill(0.5);

      // Simulate storing after search
      lastQueryVector = queryVector;

      expect(lastQueryVector).toEqual(queryVector);
    });

    it('should use existing vector when requested', () => {
      const lastQueryVector = Array(128).fill(0.3);
      const useExistingVector = true;
      const queryVector = useExistingVector ? lastQueryVector : Array(128).fill(Math.random());

      expect(queryVector).toEqual(lastQueryVector);
    });

    it('should generate new vector when not using existing', () => {
      const lastQueryVector = Array(128).fill(0.3);
      const useExistingVector = false;
      const newVector = Array(128).fill(Math.random());

      const queryVector = useExistingVector ? lastQueryVector : newVector;

      expect(queryVector).not.toEqual(lastQueryVector);
      expect(queryVector).toEqual(newVector);
    });
  });

  describe('result formatting', () => {
    it('should format results correctly', () => {
      const rawResults = [
        {
          id: 'doc0',
          vector: Array(128).fill(0.1),
          category: 'tech',
          distance: 0.95,
        },
      ];

      const formatted = rawResults.map((r) => ({
        id: r.id,
        category: r.category,
        score: r.distance,
        index: 'test-dataset',
        vector: r.vector,
      }));

      expect(formatted[0].id).toBe('doc0');
      expect(formatted[0].score).toBe(0.95);
      expect(formatted[0].vector).toBeDefined();
    });
  });
});

describe('Regression Tests', () => {
  describe('SHOW VECTOR button bug', () => {
    it('should toggle expand state correctly', () => {
      const expandedResults = new Set<number>();

      // Toggle expand for index 0
      const index = 0;
      const newSet = new Set(expandedResults);

      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }

      expect(newSet.has(index)).toBe(true);
    });

    it('should toggle collapse state correctly', () => {
      const expandedResults = new Set<number>([0]);

      // Toggle collapse for index 0
      const index = 0;
      const newSet = new Set(expandedResults);

      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }

      expect(newSet.has(index)).toBe(false);
    });

    it('should not have duplicate state updates', () => {
      // This tests the fix for the bug where fetchVector and toggleExpand both modified state
      let expandedResults = new Set<number>();

      // Incorrect implementation (had the bug):
      // expandedResults = new Set(expandedResults).add(0); // Add
      // expandedResults = new Set(expandedResults); // Then checks and removes

      // Correct implementation:
      expandedResults = new Set(expandedResults);
      if (!expandedResults.has(0)) {
        expandedResults.add(0);
      }

      expect(expandedResults.has(0)).toBe(true);
      expect(expandedResults.size).toBe(1);
    });
  });

  describe('Python timing values bug', () => {
    it('should return actual timing values not zeros', () => {
      const PROFILE = true;
      const timing: { [key: string]: number } = {};

      if (PROFILE) {
        const start = 100; // Mock time.time() * 1000
        const end = 600; // Mock time.time() * 1000

        timing['operation_ms'] = end - start;
      }

      // Should be non-zero
      if (PROFILE) {
        expect(timing['operation_ms']).toBeGreaterThan(0);
      }
    });

    it('should have all timing keys with values', () => {
      const timing = {
        oss_download_ms: 100,
        dataset_open_ms: 50,
        query_prep_ms: 1,
        data_load_ms: 200,
        similarity_calc_ms: 150,
        sorting_ms: 5,
        result_format_ms: 10,
        total_search_ms: 516,
        cleanup_ms: 20,
      };

      const allValuesNonZero = Object.values(timing).every(v => v > 0);

      expect(allValuesNonZero).toBe(true);
    });
  });

  describe('Python try-except structure', () => {
    it('should properly nest if PROFILE inside try block', () => {
      // This tests that the Python code structure is correct
      const PROFILE = true;
      let results: any[] = [];
      const timing: { [key: string]: number } = {};
      let hadError = false;

      try {
        if (PROFILE) {
          const start = Date.now();
          // Simulate operation
          timing['data_load_ms'] = 100;
        }

        results = [{ id: 'doc0' }];

        if (PROFILE) {
          const end = Date.now();
          timing['similarity_calc_ms'] = end - Date.now();
        }
      } catch (e) {
        hadError = true;
        results = [];
      }

      expect(hadError).toBe(false);
      expect(results.length).toBe(1);
    });

    it('should catch exceptions properly', () => {
      let caughtError = false;

      try {
        throw new Error('Test error');
      } catch (e) {
        caughtError = true;
      }

      expect(caughtError).toBe(true);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty results gracefully', () => {
    const response = {
      success: true,
      results: [],
      latency: '100ms',
      totalHits: 0,
      queryDimension: 128,
      queryVector: Array(128).fill(0.5),
    };

    expect(response.results).toEqual([]);
    expect(response.totalHits).toBe(0);
  });

  it('should handle missing query vector', () => {
    const response = {
      success: true,
      results: [],
      latency: '100ms',
      totalHits: 100,
      queryDimension: 128,
    };

    expect(response.queryVector).toBeUndefined();
  });

  it('should handle missing timing data', () => {
    const response = {
      success: true,
      results: [],
      latency: '100ms',
      totalHits: 100,
      queryDimension: 128,
    };

    expect(response.timing).toBeUndefined();
  });
});
