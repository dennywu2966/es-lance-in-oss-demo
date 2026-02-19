/**
 * @jest-environment node
 */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { GET } from "@/app/api/vectors/status/[jobId]/route";

describe("/api/vectors/status/[jobId] route", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("proxies status payload from backend", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "job-1",
          status: "running",
          progress: 33,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    global.fetch = fetchMock as any;

    const response = await GET(
      new Request("http://localhost/api/vectors/status/job-1") as any,
      { params: { jobId: "job-1" } } as any
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe("running");
    expect(payload.progress).toBe(33);
    expect(String(fetchMock.mock.calls[0][0]).endsWith("/api/v1/dataset/status/job-1")).toBe(true);
  });
});

