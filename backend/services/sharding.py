"""
Shard assignment helpers for Lance dataset generation.

Implements Elasticsearch-compatible Murmur3 routing so generated shard datasets
match ES shard routing when `ES_ROUTING` strategy is used.
"""

from __future__ import annotations

from typing import Any, Dict, List


def _normalize_strategy(sharding_strategy: str | None) -> str:
    strategy = str(sharding_strategy or "NONE").upper()
    if strategy not in ("NONE", "ES_ROUTING"):
        raise ValueError(f"Unsupported sharding strategy: {sharding_strategy}")
    return strategy


def _rotl32(value: int, shift: int) -> int:
    return ((value << shift) | (value >> (32 - shift))) & 0xFFFFFFFF


def _fmix32(value: int) -> int:
    value ^= value >> 16
    value = (value * 0x85EBCA6B) & 0xFFFFFFFF
    value ^= value >> 13
    value = (value * 0xC2B2AE35) & 0xFFFFFFFF
    value ^= value >> 16
    return value & 0xFFFFFFFF


def _to_signed_i32(value: int) -> int:
    value &= 0xFFFFFFFF
    if value >= 0x80000000:
        return value - 0x100000000
    return value


def es_murmur3_hash(routing: str) -> int:
    """
    Match Elasticsearch `Murmur3HashFunction.hash(String)` behavior.

    ES hashes Java UTF-16LE char bytes with Murmur3 x86_32 seed=0.
    """
    data = str(routing).encode("utf-16le")
    length = len(data)
    rounded_end = length & 0xFFFFFFFC

    h1 = 0
    c1 = 0xCC9E2D51
    c2 = 0x1B873593

    for i in range(0, rounded_end, 4):
        k1 = (
            data[i]
            | (data[i + 1] << 8)
            | (data[i + 2] << 16)
            | (data[i + 3] << 24)
        )
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = _rotl32(k1, 15)
        k1 = (k1 * c2) & 0xFFFFFFFF

        h1 ^= k1
        h1 = _rotl32(h1, 13)
        h1 = (h1 * 5 + 0xE6546B64) & 0xFFFFFFFF

    k1 = 0
    tail = length & 0x03
    if tail == 3:
        k1 ^= data[rounded_end + 2] << 16
    if tail >= 2:
        k1 ^= data[rounded_end + 1] << 8
    if tail >= 1:
        k1 ^= data[rounded_end]
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = _rotl32(k1, 15)
        k1 = (k1 * c2) & 0xFFFFFFFF
        h1 ^= k1

    h1 ^= length
    h1 = _fmix32(h1)
    return _to_signed_i32(h1)


def resolve_shard_id(
    document_id: str,
    shard_count: int,
    sharding_strategy: str,
    fallback_position: int = 0,
) -> int:
    shard_count = max(1, int(shard_count))
    strategy = _normalize_strategy(sharding_strategy)

    if shard_count == 1:
        return 0

    if strategy == "ES_ROUTING":
        return es_murmur3_hash(str(document_id)) % shard_count

    # NONE: keep deterministic and balanced for generation.
    return int(fallback_position) % shard_count


def split_documents_by_shard(
    documents: List[Dict[str, Any]],
    embeddings: List[List[float]],
    shard_count: int,
    sharding_strategy: str,
) -> Dict[int, Dict[str, List[Any]]]:
    if len(documents) != len(embeddings):
        raise ValueError("Documents and embeddings must have the same length")

    shard_count = max(1, int(shard_count))
    strategy = _normalize_strategy(sharding_strategy)

    buckets: Dict[int, Dict[str, List[Any]]] = {
        shard_id: {"documents": [], "embeddings": []}
        for shard_id in range(shard_count)
    }

    for position, (document, embedding) in enumerate(zip(documents, embeddings)):
        raw_id = document.get("_id") or document.get("id") or f"doc_{position:08d}"
        shard_id = resolve_shard_id(
            document_id=str(raw_id),
            shard_count=shard_count,
            sharding_strategy=strategy,
            fallback_position=position,
        )
        buckets[shard_id]["documents"].append(document)
        buckets[shard_id]["embeddings"].append(embedding)

    return buckets
