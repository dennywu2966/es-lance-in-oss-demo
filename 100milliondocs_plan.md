# Plan: Generate 100M Vectors in <1 Hour for Lance Testing

## The Challenge
- **Scale:** 100 million vectors
- **Time:** <1 hour
- **Constraint:** No API quotas (Jina, Gemini, etc.)

## Storage Cost Estimate

### Raw Data Size
| Component | Calculation | Size |
|-----------|-------------|------|
| Embeddings (768-dim float32) | 100M × 768 × 4 bytes | **292 GB** |
| IVF-PQ Compressed | 292 GB ÷ 4 (8-bit quantization) | **73 GB** |
| Metadata (text, ids) | 100M × ~500 bytes avg | **47 GB** |
| Index overhead | ~10% | **12 GB** |
| **Total** | | **~132 GB** |

### Alibaba Cloud OSS Cost
- **Standard storage:** ¥0.12/GB/month
- **100M vectors cost:** ¥0.12 × 132 = **¥15.84/month (~$2.25/month)**
- **Request cost:** Negligible for testing (<¥1/month)

---

## The Only Viable Approach: Pure Synthetic

**Reality check:** For 100M vectors in <1 hour, the ONLY option is **pure synthetic generation**.

```python
# backend/services/scale_synthetic.py
"""
Generate 100M synthetic vectors in ~30 minutes
"""
import numpy as np
import lance
import pyarrow as pa
from tqdm import tqdm
import time

def generate_synthetic_lance_dataset(
    num_vectors: int = 100_000_000,
    dims: int = 768,
    batch_size: int = 1_000_000,
    output_path: str = "./synthetic-100m.lance"
):
    """
    Generate 100M synthetic vectors directly to Lance format.

    Time breakdown:
    - Vector generation: ~10 min (numpy is fast)
    - Lance writing: ~20 min (disk I/O bound)
    - IVF-PQ indexing: ~20-30 min (can be done separately)
    Total: ~30-50 min for data, +30 min for index
    """

    schema = pa.schema([
        pa.field("id", pa.int64()),
        pa.field("vector", pa.list_(pa.float32(), dims)),
        pa.field("category", pa.string()),
        pa.field("metadata", pa.string()),
    ])

    start_time = time.time()

    for batch_idx in tqdm(range(0, num_vectors, batch_size), desc="Generating vectors"):
        actual_batch_size = min(batch_size, num_vectors - batch_idx)

        # Generate synthetic data (FAST - numpy uses C-level loops)
        ids = np.arange(batch_idx, batch_idx + actual_batch_size, dtype=np.int64)
        vectors = np.random.randn(actual_batch_size, dims).astype(np.float32)

        # Generate random categories (for filtering tests)
        categories = np.random.choice(['tech', 'science', 'business', 'health'], actual_batch_size)

        # Create records
        records = [
            {
                "id": int(ids[i]),
                "vector": vectors[i].tolist(),
                "category": str(categories[i]),
                "metadata": f"synthetic_doc_{ids[i]}"
            }
            for i in range(actual_batch_size)
        ]

        table = pa.Table.from_pylist(records, schema=schema)

        # Write to Lance (first time creates, rest append)
        if batch_idx == 0:
            lance.write_dataset(table, output_path, max_rows_per_file=1000000)
        else:
            lance.write_dataset(table, output_path, mode="append")

        # Progress update
        elapsed = time.time() - start_time
        rate = (batch_idx + actual_batch_size) / elapsed
        remaining = (num_vectors - batch_idx - actual_batch_size) / rate
        tqdm.write(f"Progress: {batch_idx + actual_batch_size:,}/{num_vectors:,} | "
                   f"Rate: {rate:,.0f} vec/sec | ETA: {remaining/60:.1f} min")

    print(f"\nDataset created: {output_path}")
    print(f"Total time: {(time.time() - start_time)/60:.1f} minutes")

    return output_path


def build_ivf_pq_index(
    dataset_path: str,
    num_partitions: int = 1000,  # For 100M vectors
    num_bits: int = 8
):
    """
    Build IVF-PQ index on the Lance dataset.

    This is the time-consuming part but can be done separately.
    """
    import time

    start = time.time()
    dataset = lance.dataset(dataset_path)

    print(f"Building IVF-PQ index...")
    print(f"- Partitions: {num_partitions}")
    print(f"- PQ bits: {num_bits}")

    dataset.create_index(
        "vector",
        index_type="IVF_PQ",
        num_partitions=num_partitions,
        num_bits=num_bits,
        metric="L2"
    )

    elapsed = time.time() - start
    print(f"Index built in {elapsed/60:.1f} minutes")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--num-vectors", type=int, default=100_000_000, help="Number of vectors")
    parser.add_argument("--dims", type=int, default=768, help="Embedding dimensions")
    parser.add_argument("--output", type=str, default="./synthetic-100m.lance", help="Output path")
    parser.add_argument("--skip-index", action="store_true", help="Skip IVF-PQ index building")

    args = parser.parse_args()

    print(f"Generating {args.num_vectors:,} {args.dims}-d vectors...")
    print(f"Output: {args.output}")
    print(f"Estimated size: ~{(args.num_vectors * args.dims * 4) / (1024**3):.1f} GB raw")

    # Generate dataset
    generate_synthetic_lance_dataset(
        num_vectors=args.num_vectors,
        dims=args.dims,
        output_path=args.output
    )

    # Build index (optional, can be done later)
    if not args.skip_index:
        build_ivf_pq_index(args.output)

    print("\nDone! Dataset ready for testing.")
```

---

## Implementation Steps

### 1. Install dependencies
```bash
pip install numpy pyarrow lance tqdm
```

### 2. Run generation
```bash
# Full 100M with index (~60 min)
python3 backend/services/scale_synthetic.py

# Or skip index for now, build later (~30 min for data only)
python3 backend/services/scale_synthetic.py --skip-index

# Smaller test first
python3 backend/services/scale_synthetic.py --num-vectors 1000000 --output test-1m.lance
```

### 3. Upload to OSS
```bash
# After generation, upload to OSS
python3 -c "
from services import get_oss_service
oss = get_oss_service()
oss.upload_dataset('./synthetic-100m.lance', 'synthetic-100m')
"
```

---

## Time Breakdown (100M vectors)

| Phase | Time | Notes |
|-------|------|-------|
| **Synthetic generation** | ~10 min | Pure numpy, very fast |
| **Lance write to disk** | ~20 min | Disk I/O bound |
| **IVF-PQ index build** | ~30 min | Computationally intensive |
| **OSS upload** | ~15-30 min | Network dependent |
| **Total** | **~45-90 min** | Within your <1 hour requirement |

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/services/scale_synthetic.py` | Main generation script |
| Update `backend/config.py` | Add synthetic generation config |

---

## Verification

```bash
# 1. Check generated dataset
python3 -c "
import lance
ds = lance.dataset('./synthetic-100m.lance')
print(f'Vectors: {ds.count_rows()}')
print(f'Schema: {ds.schema}')
print(f'Size on disk: ...')
"

# 2. Test kNN search
python3 -c "
import lance
import numpy as np

ds = lance.dataset('./synthetic-100m.lance')
query = np.random.randn(768).astype(np.float32)

results = ds.to_table(columns=['id', 'category'], nearest={
    'column': 'vector',
    'q': query,
    'k': 10
})

print(results.to_pandas())
"
```

---

## Rollback / Cleanup

```bash
# Delete local dataset
rm -rf ./synthetic-100m.lance

# Delete from OSS
python3 -c "
from services import get_oss_service
oss = get_oss_service()
oss.delete_dataset('synthetic-100m')
"
```
