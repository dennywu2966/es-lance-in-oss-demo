import shutil
import tempfile
import unittest
from pathlib import Path

from services.dataset_append import (
    assign_documents_to_shards_for_append,
    ensure_routing_ids_for_target_shard,
    parse_existing_shard_roots,
    resolve_shard_root_path,
    validate_target_shard_id,
)
from services.sharding import resolve_shard_id


class DatasetAppendTests(unittest.TestCase):
    def test_validate_target_shard_id_rejects_out_of_range(self):
        with self.assertRaises(ValueError):
            validate_target_shard_id(target_shard_id=-1, shard_count=4)

        with self.assertRaises(ValueError):
            validate_target_shard_id(target_shard_id=4, shard_count=4)

    def test_validate_target_shard_id_accepts_range(self):
        self.assertEqual(0, validate_target_shard_id(target_shard_id=0, shard_count=4))
        self.assertEqual(3, validate_target_shard_id(target_shard_id=3, shard_count=4))

    def test_ensure_routing_ids_for_target_shard_es_routing(self):
        docs = [{"_id": f"doc_{idx}", "id": f"doc_{idx}"} for idx in range(12)]
        normalized = ensure_routing_ids_for_target_shard(
            documents=docs,
            shard_count=4,
            sharding_strategy="ES_ROUTING",
            target_shard_id=2,
        )
        self.assertEqual(12, len(normalized))
        self.assertEqual(12, len({doc["id"] for doc in normalized}))
        original_ids = {doc["id"] for doc in docs}
        self.assertTrue(all(doc["id"] not in original_ids for doc in normalized))
        for doc in normalized:
            doc_id = doc.get("_id") or doc.get("id")
            shard_id = resolve_shard_id(doc_id, 4, "ES_ROUTING")
            self.assertEqual(2, shard_id)

    def test_assign_documents_to_shards_uses_target_shard_when_provided(self):
        docs = [{"_id": f"doc_{idx}", "id": f"doc_{idx}"} for idx in range(8)]
        vectors = [[float(idx), float(idx + 1)] for idx in range(8)]
        buckets = assign_documents_to_shards_for_append(
            documents=docs,
            embeddings=vectors,
            shard_count=4,
            sharding_strategy="ES_ROUTING",
            target_shard_id=1,
        )
        self.assertEqual({1}, set(buckets.keys()))
        self.assertEqual(8, len(buckets[1]["documents"]))

    def test_parse_existing_shard_roots_detects_shard_dirs(self):
        temp_dir = tempfile.mkdtemp(prefix="append-shard-roots-")
        try:
            Path(temp_dir, "shard-0", "data.lance").mkdir(parents=True, exist_ok=True)
            Path(temp_dir, "shard-1", "data.lance").mkdir(parents=True, exist_ok=True)
            roots = parse_existing_shard_roots(temp_dir)
            self.assertEqual({0, 1}, set(roots.keys()))
            self.assertTrue(str(roots[0]).endswith("shard-0"))
            self.assertTrue(str(roots[1]).endswith("shard-1"))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_resolve_shard_root_path_builds_expected_path(self):
        temp_dir = tempfile.mkdtemp(prefix="append-shard-path-")
        try:
            root = resolve_shard_root_path(
                local_dataset_root=temp_dir,
                shard_id=3,
                shard_path_template="shard-{shard_id}",
            )
            self.assertEqual(str(Path(temp_dir, "shard-3")), str(root))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
