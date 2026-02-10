#!/usr/bin/env python3
"""
Generate 100k real documents with 768-dim vectors using Wikipedia dataset.

Following 100kdocs_plan.md:
- Uses Hugging Face Wikipedia dataset (free, real text)
- HashingVectorizer for fast 768-dim embeddings (CPU-only, <10 min)
- Writes to Lance dataset with IVF_PQ index
- Uploads to OSS using existing oss.py service

Usage:
    cd backend && python -m services.generate_real_100k --count 100000

Options:
    --count N       Number of documents (default: 100000)
    --dims D        Vector dimensions (default: 768)
    --lang L        Language: en or zh (default: en)
    --skip-upload   Skip OSS upload
    --output DIR    Output directory (default: ./out)
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any

import numpy as np
import pyarrow as pa

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import load_oss_config
from services.oss import get_oss_service

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def download_wikipedia_dataset(
    lang: str = "en",
    count: int = 100000,
    min_chars: int = 200,
    seed: int = 42
) -> Tuple[List[str], List[str], List[str]]:
    """
    Download and sample Wikipedia dataset from Hugging Face.

    Args:
        lang: Language code (en or zh)
        count: Number of documents to sample
        min_chars: Minimum text length
        seed: Random seed for reproducibility

    Returns:
        Tuple of (ids, titles, texts)
    """
    from datasets import load_dataset

    logger.info(f"Loading Wikipedia dataset (lang={lang})...")

    # Use wikimedia/wikipedia which is the new format (Parquet-based, no scripts)
    # Available configs: 20231101.en, 20231101.zh, etc.
    try:
        if lang == "zh":
            dataset = load_dataset("wikimedia/wikipedia", "20231101.zh", split="train")
        else:
            dataset = load_dataset("wikimedia/wikipedia", "20231101.en", split="train")
    except Exception as e:
        logger.warning(f"Failed to load wikimedia/wikipedia: {e}")
        logger.info("Trying ag_news as fallback...")
        # Fallback to ag_news (news articles) - smaller but works without scripts
        dataset = load_dataset("ag_news", split="train")
        # ag_news has 'text' and 'label' columns
        logger.info(f"Loaded ag_news with {len(dataset)} documents")

    logger.info(f"Dataset loaded with {len(dataset)} documents")

    # Filter by minimum length
    logger.info(f"Filtering documents with min_chars={min_chars}...")

    # Sample with fixed seed for reproducibility
    np.random.seed(seed)

    ids = []
    titles = []
    texts = []

    # Shuffle indices
    total_docs = len(dataset)
    indices = np.random.permutation(total_docs)

    for idx in indices:
        if len(ids) >= count:
            break

        doc = dataset[int(idx)]
        text = doc.get("text", "")

        # Filter short texts
        if len(text) < min_chars:
            continue

        # Truncate very long texts (to save memory and speed up vectorization)
        max_chars = 2000
        if len(text) > max_chars:
            text = text[:max_chars]

        doc_id = f"wiki_{lang}_{idx}"
        title = doc.get("title", f"Document {idx}")

        ids.append(doc_id)
        titles.append(title)
        texts.append(text)

        if len(ids) % 10000 == 0:
            logger.info(f"Sampled {len(ids)}/{count} documents...")

    logger.info(f"Final sample: {len(ids)} documents")
    return ids, titles, texts


def generate_hashing_vectors(
    texts: List[str],
    dims: int = 768,
    lang: str = "en",
    batch_size: int = 4096
) -> np.ndarray:
    """
    Generate vectors using HashingVectorizer (fast, CPU-only).

    As per 100kdocs_plan.md, this is the fastest approach:
    - No fit needed (streaming)
    - Fixed output dimensions
    - L2 normalized for cosine similarity

    Args:
        texts: List of text documents
        dims: Output vector dimensions (default: 768)
        lang: Language for analyzer config
        batch_size: Processing batch size

    Returns:
        numpy array of shape (n_docs, dims)
    """
    from sklearn.feature_extraction.text import HashingVectorizer
    from sklearn.preprocessing import normalize

    logger.info(f"Generating {dims}-dim vectors for {len(texts)} documents...")

    # Configure vectorizer based on language
    if lang == "zh":
        # Chinese: character n-grams (no tokenization needed)
        vectorizer = HashingVectorizer(
            n_features=dims,
            analyzer="char",
            ngram_range=(3, 5),
            alternate_sign=False,
            norm=None  # We'll normalize after
        )
    else:
        # English: word n-grams
        vectorizer = HashingVectorizer(
            n_features=dims,
            analyzer="word",
            ngram_range=(1, 2),
            alternate_sign=False,
            norm=None
        )

    start_time = time.time()

    # Process in batches for memory efficiency
    all_vectors = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_vectors = vectorizer.transform(batch).toarray()
        all_vectors.append(batch_vectors)

        if (i + batch_size) % 20000 == 0:
            logger.info(f"Vectorized {min(i + batch_size, len(texts))}/{len(texts)}...")

    vectors = np.vstack(all_vectors).astype(np.float32)

    # L2 normalize for cosine similarity
    vectors = normalize(vectors, norm='l2')

    elapsed = time.time() - start_time
    logger.info(f"Vectorization complete in {elapsed:.1f}s ({len(texts)/elapsed:.0f} docs/sec)")

    return vectors


def create_lance_dataset(
    output_dir: str,
    ids: List[str],
    titles: List[str],
    texts: List[str],
    vectors: np.ndarray,
    build_index: bool = True,
    num_partitions: int = 128,
    num_sub_vectors: int = 64
) -> str:
    """
    Create Lance dataset with vectors.

    Args:
        output_dir: Base output directory
        ids: Document IDs
        titles: Document titles
        texts: Document texts
        vectors: numpy array of shape (n, dims)
        build_index: Whether to build IVF_PQ index
        num_partitions: Number of IVF partitions
        num_sub_vectors: Number of PQ sub-vectors

    Returns:
        Path to the Lance dataset
    """
    import lance

    n_docs = len(ids)
    dims = vectors.shape[1]

    # Dataset name follows existing convention
    dataset_name = f"real-{n_docs // 1000}k-dims-{dims}"
    dataset_root = Path(output_dir) / f"{dataset_name}.lance"
    data_lance_path = dataset_root / "data.lance"

    # Create directory structure
    dataset_root.mkdir(parents=True, exist_ok=True)

    logger.info(f"Creating Lance dataset at {data_lance_path}...")

    # Generate categories and topics from titles
    categories = []
    topics = []
    for title in titles:
        # Simple category assignment based on title
        title_lower = title.lower()
        if any(w in title_lower for w in ["science", "physics", "chemistry", "biology"]):
            cat = "science"
        elif any(w in title_lower for w in ["history", "war", "century", "ancient"]):
            cat = "history"
        elif any(w in title_lower for w in ["geography", "country", "city", "river"]):
            cat = "geography"
        elif any(w in title_lower for w in ["art", "music", "film", "book"]):
            cat = "culture"
        elif any(w in title_lower for w in ["sport", "football", "basketball", "olympic"]):
            cat = "sports"
        elif any(w in title_lower for w in ["technology", "computer", "software", "internet"]):
            cat = "technology"
        else:
            cat = "general"
        categories.append(cat)
        topics.append(cat)  # Use category as topic for simplicity

    # Build Arrow table efficiently (as per 100kdocs_plan.md)
    logger.info("Building Arrow table...")

    # Flatten vectors for FixedSizeListArray
    flat_vectors = vectors.reshape(-1)
    vector_array = pa.FixedSizeListArray.from_arrays(
        pa.array(flat_vectors, type=pa.float32()),
        dims
    )

    table = pa.table({
        "_id": pa.array(ids, type=pa.string()),
        "id": pa.array(ids, type=pa.string()),
        "title": pa.array(titles, type=pa.string()),
        "text": pa.array(texts, type=pa.string()),
        "topic": pa.array(topics, type=pa.string()),
        "category": pa.array(categories, type=pa.string()),
        "vector": vector_array,
    })

    # Write to Lance using LanceDB
    logger.info(f"Writing {n_docs} rows to Lance...")
    start_time = time.time()

    import lancedb

    # Create LanceDB connection
    db = lancedb.connect(str(dataset_root))

    # Create table with the data
    tb = db.create_table(
        "data",
        table,
        mode="overwrite"
    )

    write_time = time.time() - start_time
    logger.info(f"Lance write complete in {write_time:.1f}s")

    # Build index
    if build_index:
        logger.info(f"Building IVF_PQ index (partitions={num_partitions}, sub_vectors={num_sub_vectors})...")
        start_time = time.time()

        tb.create_index(
            vector_column_name="vector",
            metric="cosine",
            num_partitions=num_partitions,
            num_sub_vectors=num_sub_vectors,
            replace=True,
            index_type="IVF_PQ"
        )

        index_time = time.time() - start_time
        logger.info(f"Index build complete in {index_time:.1f}s")

    return str(dataset_root)


def upload_to_oss(local_path: str, dataset_name: str) -> Dict[str, Any]:
    """
    Upload Lance dataset to OSS.

    Args:
        local_path: Path to local dataset root (containing data.lance/)
        dataset_name: Name for the dataset in OSS

    Returns:
        Upload result dict
    """
    logger.info(f"Uploading {local_path} to OSS as {dataset_name}...")

    oss_service = get_oss_service()
    result = oss_service.upload_dataset(local_path, dataset_name)

    logger.info(f"Upload complete: {result['files_uploaded']} files, {result['total_size']}")
    return result


def verify_dataset(lance_path: str) -> Dict[str, Any]:
    """
    Verify the created Lance dataset.

    Args:
        lance_path: Path to data.lance directory

    Returns:
        Verification result dict
    """
    import lancedb

    logger.info(f"Verifying dataset at {lance_path}...")

    # Get parent directory (dataset root)
    dataset_root = Path(lance_path).parent
    db = lancedb.connect(str(dataset_root))

    # Open the table
    tb = db.open_table("data")

    result = {
        "rows": tb.count_rows(),
        "schema": str(tb.schema),
        "has_index": len(tb.list_indices()) > 0
    }

    logger.info(f"Verification: {result['rows']} rows, index={result['has_index']}")
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Generate 100k real documents with 768-dim vectors"
    )
    parser.add_argument(
        "--count", type=int, default=100000,
        help="Number of documents to generate (default: 100000)"
    )
    parser.add_argument(
        "--dims", type=int, default=768,
        help="Vector dimensions (default: 768)"
    )
    parser.add_argument(
        "--lang", type=str, default="en", choices=["en", "zh"],
        help="Language: en or zh (default: en)"
    )
    parser.add_argument(
        "--output", type=str, default="./out",
        help="Output directory (default: ./out)"
    )
    parser.add_argument(
        "--skip-upload", action="store_true",
        help="Skip OSS upload"
    )
    parser.add_argument(
        "--skip-index", action="store_true",
        help="Skip building IVF_PQ index"
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducibility (default: 42)"
    )

    args = parser.parse_args()

    total_start = time.time()

    # Step 1: Download and sample Wikipedia
    logger.info("=" * 60)
    logger.info("Step 1: Downloading Wikipedia dataset")
    logger.info("=" * 60)

    ids, titles, texts = download_wikipedia_dataset(
        lang=args.lang,
        count=args.count,
        seed=args.seed
    )

    # Step 2: Generate vectors
    logger.info("=" * 60)
    logger.info("Step 2: Generating vectors with HashingVectorizer")
    logger.info("=" * 60)

    vectors = generate_hashing_vectors(
        texts,
        dims=args.dims,
        lang=args.lang
    )

    # Step 3: Create Lance dataset
    logger.info("=" * 60)
    logger.info("Step 3: Creating Lance dataset")
    logger.info("=" * 60)

    dataset_path = create_lance_dataset(
        output_dir=args.output,
        ids=ids,
        titles=titles,
        texts=texts,
        vectors=vectors,
        build_index=not args.skip_index
    )

    # Step 4: Verify
    logger.info("=" * 60)
    logger.info("Step 4: Verifying dataset")
    logger.info("=" * 60)

    data_lance_path = Path(dataset_path) / "data.lance"
    verify_result = verify_dataset(str(data_lance_path))

    # Step 5: Upload to OSS
    if not args.skip_upload:
        logger.info("=" * 60)
        logger.info("Step 5: Uploading to OSS")
        logger.info("=" * 60)

        # Extract dataset name from path
        dataset_name = Path(dataset_path).name.replace(".lance", "")
        upload_result = upload_to_oss(dataset_path, dataset_name)

    total_time = time.time() - total_start

    logger.info("=" * 60)
    logger.info("COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Total time: {total_time:.1f}s ({total_time/60:.1f} min)")
    logger.info(f"Documents: {len(ids)}")
    logger.info(f"Dimensions: {args.dims}")
    logger.info(f"Local path: {dataset_path}")
    if not args.skip_upload:
        logger.info(f"OSS path: datasets/{dataset_name}/")

    return 0


if __name__ == "__main__":
    sys.exit(main())
