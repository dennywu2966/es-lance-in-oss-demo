/**
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { POST } from "@/app/api/vectors/generate/route";

function makeRequest(body: Record<string, unknown>, url = "http://localhost/api/vectors/generate") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/vectors/generate route", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.PYTHON_BACKEND_URL;
    delete process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL;
    delete process.env.DATASET_GENERATE_SYNC_TIMEOUT_MS;
    jest.restoreAllMocks();
  });

  it("proxies to Python backend and waits until job completion", async () => {
    const fetchMock = jest.fn();

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, job_id: "job-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running", progress: 55 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "completed",
            result: {
              dataset_name: "vectors-30-dims-128-shards-4-es-routing-123",
              vectors: 30,
              dims: 128,
              shard_count: 4,
              sharding_strategy: "ES_ROUTING",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    global.fetch = fetchMock as any;

    const response = await POST(
      makeRequest({
        vectors: 30,
        dims: 128,
        shards: 4,
        shardingStrategy: "ES_ROUTING",
      })
    );

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.dataset).toBe("vectors-30-dims-128-shards-4-es-routing-123");
    expect(payload.shardCount).toBe(4);
    expect(payload.shards).toBe(4);
    expect(payload.shardingStrategy).toBe("ES_ROUTING");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const generateUrl = String(fetchMock.mock.calls[0][0]);
    expect(generateUrl.endsWith("/api/v1/dataset/generate")).toBe(true);

    const generateOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(generateOptions?.method).toBe("POST");
    expect(String(generateOptions?.body)).toContain('"shard_count":4');
    expect(String(generateOptions?.body)).toContain('"sharding_strategy":"ES_ROUTING"');

    const statusUrl = String(fetchMock.mock.calls[1][0]);
    expect(statusUrl.endsWith("/api/v1/dataset/status/job-123")).toBe(true);
  });

  it("returns 502 when Python generate endpoint fails", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response("backend broken", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    );
    global.fetch = fetchMock as any;

    const response = await POST(makeRequest({ vectors: 10, dims: 128, shards: 4 }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.success).toBe(false);
    expect(String(payload.error || "")).toContain("Python backend generate failed");
  });
});
