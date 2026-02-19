import { extractProfileShardIds, resolveLanceUriForShard, safeTraceJson } from "@/lib/trace-debug";

describe("trace debug helpers", () => {
  it("extracts and sorts shard ids from ES profile payload", () => {
    const ids = extractProfileShardIds({
      shards: [{ id: "2" }, { id: "0" }, { id: "1" }, { id: "2" }],
    });
    expect(ids).toEqual([0, 1, 2]);
  });

  it("resolves shard-aware lance URI using shard path template", () => {
    const uri = resolveLanceUriForShard(
      {
        uri_prefix: "oss://demo-bucket/datasets/ds-1",
        shard_path: "shard-{shard_id}",
        dataset_name: "data.lance",
      },
      "ignored-index",
      3
    );
    expect(uri).toBe("oss://demo-bucket/datasets/ds-1/shard-3/data.lance");
  });

  it("keeps serialized trace debug payload bounded", () => {
    const payload = { value: "x".repeat(3000) };
    const serialized = safeTraceJson(payload, 200);
    expect(serialized.length).toBeGreaterThan(0);
    expect(serialized).toContain("...<truncated>");
  });
});
