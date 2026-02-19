/**
 * @jest-environment node
 */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { POST } from "@/app/api/vectors/append/start/route";

function makeRequest(body: Record<string, unknown>, url = "http://localhost/api/vectors/append/start") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/vectors/append/start route", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("starts backend append job with target_shard_id", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          job_id: "job-append-789",
          message: "Dataset append job started",
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
        dataset: "vectors-100-dims-768-shards-4-es-routing-1",
        vectors: 6,
        target_shard_id: 2,
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.job_id).toBe("job-append-789");
    expect(payload.target_shard_id).toBe(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0]).endsWith("/api/v1/dataset/append")).toBe(true);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"target_shard_id":2');
  });

  it("returns 400 when dataset is missing", async () => {
    const response = await POST(makeRequest({ vectors: 3 }));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("dataset is required");
  });
});

