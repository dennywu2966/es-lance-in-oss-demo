"""
Helpers for appending vectors/documents to existing Lance datasets.

This module keeps shard-aware append logic isolated and testable.
"""

from __future__ import annotations

import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.lance import LanceService
from services.sharding import resolve_shard_id, split_documents_by_shard


def validate_target_shard_id(target_shard_id: Optional[int], shard_count: int) -> Optional[int]:
    if target_shard_id is None:
        return None
    shard_count = max(1, int(shard_count))
    shard_id = int(target_shard_id)
    if shard_id < 0 or shard_id >= shard_count:
        raise ValueError(f"target_shard_id must be in range [0, {shard_count - 1}]")
    return shard_id


def parse_existing_shard_roots(local_dataset_root: str | Path) -> Dict[int, Path]:
    root = Path(local_dataset_root)
    shard_roots: Dict[int, Path] = {}
    if not root.exists():
        return shard_roots

    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        match = re.fullmatch(r"shard-(\d+)", entry.name)
        if not match:
            continue
        shard_id = int(match.group(1))
        shard_roots[shard_id] = entry
    return shard_roots


def resolve_shard_root_path(
    local_dataset_root: str | Path,
    shard_id: int,
    shard_path_template: Optional[str] = None,
    index_name: str = "",
) -> Path:
    template = (shard_path_template or "shard-{shard_id}").strip()
    resolved = (
        template.replace("{shard_id}", str(shard_id))
        .replace("{index}", index_name or "")
        .strip("/")
    )
    if not resolved:
        resolved = f"shard-{shard_id}"

    return Path(local_dataset_root) / resolved


def _candidate_id(seed: int, nonce: int) -> str:
    return f"doc_append_{seed}_{nonce}_{uuid.uuid4().hex[:10]}"


def _id_for_target_shard(
    shard_count: int,
    sharding_strategy: str,
    target_shard_id: int,
) -> str:
    seed = int(time.time() * 1000)
    nonce = 0
    while True:
        doc_id = _candidate_id(seed, nonce)
        if resolve_shard_id(doc_id, shard_count, sharding_strategy) == target_shard_id:
            return doc_id
        nonce += 1


def ensure_routing_ids_for_target_shard(
    documents: List[Dict[str, Any]],
    shard_count: int,
    sharding_strategy: str,
    target_shard_id: Optional[int],
) -> List[Dict[str, Any]]:
    """
    Assign fresh append IDs. For ES_ROUTING + target shard, ensure IDs hash to that shard.
    """
    normalized_target = validate_target_shard_id(target_shard_id, shard_count)
    strategy = str(sharding_strategy or "NONE").upper()
    normalized_docs: List[Dict[str, Any]] = []
    generated_ids: set[str] = set()

    for source in documents:
        doc = dict(source)
        if strategy == "ES_ROUTING" and normalized_target is not None:
            while True:
                fresh_id = _id_for_target_shard(shard_count, strategy, normalized_target)
                if fresh_id not in generated_ids:
                    break
            doc["_id"] = fresh_id
            doc["id"] = fresh_id
        else:
            while True:
                fresh_id = _candidate_id(int(time.time() * 1000), len(normalized_docs))
                if fresh_id not in generated_ids:
                    break
            doc["_id"] = fresh_id
            doc["id"] = fresh_id
        generated_ids.add(str(doc["id"]))
        normalized_docs.append(doc)

    return normalized_docs


def assign_documents_to_shards_for_append(
    documents: List[Dict[str, Any]],
    embeddings: List[List[float]],
    shard_count: int,
    sharding_strategy: str,
    target_shard_id: Optional[int] = None,
) -> Dict[int, Dict[str, List[Any]]]:
    if len(documents) != len(embeddings):
        raise ValueError("documents and embeddings length mismatch")

    shard_count = max(1, int(shard_count))
    strategy = str(sharding_strategy or "NONE").upper()
    normalized_target = validate_target_shard_id(target_shard_id, shard_count)
    normalized_docs = ensure_routing_ids_for_target_shard(
        documents=documents,
        shard_count=shard_count,
        sharding_strategy=strategy,
        target_shard_id=normalized_target,
    )

    if normalized_target is not None:
        return {
            normalized_target: {
                "documents": normalized_docs,
                "embeddings": embeddings,
            }
        }

    return split_documents_by_shard(
        documents=normalized_docs,
        embeddings=embeddings,
        shard_count=shard_count,
        sharding_strategy=strategy,
    )


def build_append_records(
    documents: List[Dict[str, Any]],
    embeddings: List[List[float]],
) -> List[Dict[str, Any]]:
    if len(documents) != len(embeddings):
        raise ValueError("documents and embeddings length mismatch")

    rows: List[Dict[str, Any]] = []
    for idx, (doc, vector) in enumerate(zip(documents, embeddings)):
        doc_id = str(doc.get("_id") or doc.get("id") or f"doc_{idx}")
        topic = str(doc.get("topic") or doc.get("category") or "general")
        rows.append(
            {
                "_id": doc_id,
                "id": str(doc.get("id") or doc_id),
                "title": str(doc.get("title") or f"Appended Document {idx + 1}"),
                "text": str(doc.get("text") or ""),
                "topic": topic,
                "category": str(doc.get("category") or topic),
                "vector": vector,
            }
        )
    return rows


def append_documents_to_local_dataset(
    *,
    lance_service: LanceService,
    local_dataset_root: str | Path,
    documents: List[Dict[str, Any]],
    embeddings: List[List[float]],
    shard_count: int,
    sharding_strategy: str,
    dims: int,
    target_shard_id: Optional[int] = None,
    shard_path_template: Optional[str] = None,
    index_name: str = "",
) -> Dict[str, Any]:
    """
    Append document/vector rows to local Lance dataset layout.
    """
    root = Path(local_dataset_root)
    root.mkdir(parents=True, exist_ok=True)
    strategy = str(sharding_strategy or "NONE").upper()
    shard_count = max(1, int(shard_count))

    shard_payload = assign_documents_to_shards_for_append(
        documents=documents,
        embeddings=embeddings,
        shard_count=shard_count,
        sharding_strategy=strategy,
        target_shard_id=target_shard_id,
    )

    existing_shard_roots = parse_existing_shard_roots(root)
    shard_updates: Dict[int, int] = {}
    appended_total = 0

    if shard_count == 1 and strategy == "NONE":
        rows = build_append_records(
            shard_payload.get(0, {}).get("documents", []),
            shard_payload.get(0, {}).get("embeddings", []),
        )
        # Ensure legacy single-shard dataset exists.
        if not root.exists():
            root.mkdir(parents=True, exist_ok=True)
        try:
            summary = lance_service.append_records(str(root), rows, expected_dims=dims)
        except Exception:
            lance_service.create_dataset([], [], str(root), expected_dims=dims)
            summary = lance_service.append_records(str(root), rows, expected_dims=dims)
        shard_updates[0] = int(summary.get("appended", 0))
        appended_total += int(summary.get("appended", 0))
    else:
        for shard_id in sorted(shard_payload.keys()):
            shard_docs = shard_payload[shard_id]["documents"]
            shard_vectors = shard_payload[shard_id]["embeddings"]
            rows = build_append_records(shard_docs, shard_vectors)
            shard_root = existing_shard_roots.get(
                shard_id,
                resolve_shard_root_path(
                    local_dataset_root=root,
                    shard_id=shard_id,
                    shard_path_template=shard_path_template,
                    index_name=index_name,
                ),
            )
            if not shard_root.exists():
                shard_root.mkdir(parents=True, exist_ok=True)
                lance_service.create_dataset([], [], str(shard_root), expected_dims=dims)

            try:
                summary = lance_service.append_records(str(shard_root), rows, expected_dims=dims)
            except Exception:
                lance_service.create_dataset([], [], str(shard_root), expected_dims=dims)
                summary = lance_service.append_records(str(shard_root), rows, expected_dims=dims)

            shard_updates[shard_id] = int(summary.get("appended", 0))
            appended_total += int(summary.get("appended", 0))

    return {
        "appended": appended_total,
        "shard_updates": shard_updates,
    }
