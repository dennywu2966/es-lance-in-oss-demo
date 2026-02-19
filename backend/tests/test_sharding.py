import unittest

from services.sharding import (
    es_murmur3_hash,
    resolve_shard_id,
    split_documents_by_shard,
)


class ShardingTests(unittest.TestCase):
    def test_es_murmur3_hash_matches_elasticsearch_known_values(self):
        known = {
            "hell": 0x5A0CB7C3,
            "hello": 0xD7C31989,
            "hello w": 0x22AB2984,
            "hello wo": 0xDF0CA123,
            "hello wor": 0xE7744D61,
            "The quick brown fox jumps over the lazy dog": 0xE07DB09C,
            "The quick brown fox jumps over the lazy cog": 0x4E63D2AD,
        }
        for value, expected_unsigned in known.items():
            actual_unsigned = es_murmur3_hash(value) & 0xFFFFFFFF
            self.assertEqual(
                expected_unsigned,
                actual_unsigned,
                f"hash mismatch for value={value!r}",
            )

    def test_resolve_shard_id_uses_floor_mod_behavior(self):
        self.assertEqual(0, resolve_shard_id("doc-1", 1, "ES_ROUTING"))
        for shard_count in (2, 4, 8):
            shard = resolve_shard_id("doc-1", shard_count, "ES_ROUTING")
            self.assertGreaterEqual(shard, 0)
            self.assertLess(shard, shard_count)

    def test_split_documents_by_shard_keeps_all_docs_and_creates_all_shards(self):
        docs = []
        embeddings = []
        for idx in range(24):
            docs.append(
                {
                    "_id": f"doc_{idx:04d}",
                    "id": f"doc_{idx:04d}",
                    "text": f"text-{idx}",
                }
            )
            embeddings.append([float(idx), float(idx + 1), float(idx + 2), float(idx + 3)])

        buckets = split_documents_by_shard(
            documents=docs,
            embeddings=embeddings,
            shard_count=4,
            sharding_strategy="ES_ROUTING",
        )

        self.assertEqual({0, 1, 2, 3}, set(buckets.keys()))

        total_docs = sum(len(item["documents"]) for item in buckets.values())
        total_vecs = sum(len(item["embeddings"]) for item in buckets.values())
        self.assertEqual(len(docs), total_docs)
        self.assertEqual(len(embeddings), total_vecs)


if __name__ == "__main__":
    unittest.main()
