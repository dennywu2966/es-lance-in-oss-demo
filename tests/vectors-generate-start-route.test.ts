/**
 * @jest-environment node
 */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { POST } from "@/app/api/vectors/generate/start/route";

function makeRequest(body: Record<string, unknown>, url = "http://localhost/api/vectors/generate/start") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/vectors/generate/start route", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("starts backend generate job and returns job_id", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          job_id: "job-generate-123",
          message: "Dataset generation job started",
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
        vectors: 12,
        dims: 128,
        shards: 4,
        shardingStrategy: "ES_ROUTING",
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.job_id).toBe("job-generate-123");
    expect(payload.shard_count).toBe(4);
    expect(payload.sharding_strategy).toBe("ES_ROUTING");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0]).endsWith("/api/v1/dataset/generate")).toBe(true);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"shard_count":4');
  });

  it("returns 502 when backend generate endpoint fails", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response("backend down", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
    global.fetch = fetchMock as any;

    const response = await POST(makeRequest({ vectors: 10, dims: 64 }));
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(String(payload.error || "")).toContain("Python backend generate failed");
  });
});

