"""
Lance service for creating and managing vector datasets.

Handles Lance dataset creation with IVF-PQ indexing
for efficient approximate nearest neighbor search.
Uses the new LanceDB API (lancedb >= 0.27).
"""
import numpy as np
import lancedb
import pyarrow as pa
from typing import List, Dict, Any
import logging
import tempfile
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

class LanceService:
    """Service for creating and managing Lance datasets"""

    @staticmethod
    def _list_tables(db: Any) -> List[str]:
        tables_response = db.list_tables()
        if isinstance(tables_response, list):
            return list(tables_response)
        if hasattr(tables_response, "tables"):
            return list(tables_response.tables)
        if hasattr(tables_response, "names"):
            return list(tables_response.names)
        try:
            return list(tables_response)
        except Exception:
            return []

    @staticmethod
    def _vector_dims_from_schema(schema: Any) -> int:
        for field in schema:
            if field.name == "vector" and hasattr(field.type, "list_size"):
                return int(field.type.list_size)
        return 0

    def create_dataset(
        self,
        documents: List[Dict[str, Any]],
        embeddings: List[List[float]],
        output_path: str,
        expected_dims: int | None = None,
    ) -> Dict[str, Any]:
        """
        Create a Lance dataset from documents and embeddings.

        Args:
            documents: List of document dictionaries with id, title, text, topic, etc.
            embeddings: List of embedding vectors (same length as documents)
            output_path: Path to write the Lance dataset

        Returns:
            Dataset metadata
        """
        if len(documents) != len(embeddings):
            raise ValueError("Documents and embeddings must have same length")

        # Create output directory
        Path(output_path).mkdir(parents=True, exist_ok=True)

        n_vectors = len(documents)
        dims = int(expected_dims) if expected_dims and int(expected_dims) > 0 else 0
        vectors_array = None
        if n_vectors > 0:
            vectors_array = np.array(embeddings, dtype=np.float32)
            _, inferred_dims = vectors_array.shape
            dims = inferred_dims
        elif dims <= 0:
            raise ValueError("expected_dims must be provided when creating an empty shard dataset")

        logger.info(f"Creating LanceDB dataset at {output_path} with {n_vectors} vectors, {dims} dims")

        # Connect to LanceDB
        db = lancedb.connect(output_path)

        # Create the table with data - LanceDB >= 0.27 expects list of dicts
        if n_vectors > 0 and vectors_array is not None:
            table_data = [
                {
                    '_id': doc.get('_id', doc.get('id', f'doc_{i}')),
                    'id': doc.get('id', f'doc_{i}'),
                    'title': doc.get('title', ''),
                    'text': doc.get('text', ''),
                    'topic': doc.get('topic', doc.get('category', 'unknown')),
                    'category': doc.get('topic', doc.get('category', 'unknown')),
                    'vector': vectors_array[i].tolist()
                }
                for i, doc in enumerate(documents)
            ]
            table = db.create_table("data", data=table_data)
        else:
            # Ensure all shards have a resolvable Lance dataset path, even when empty.
            schema = pa.schema([
                pa.field("_id", pa.string()),
                pa.field("id", pa.string()),
                pa.field("title", pa.string()),
                pa.field("text", pa.string()),
                pa.field("topic", pa.string()),
                pa.field("category", pa.string()),
                pa.field("vector", pa.list_(pa.float32(), dims)),
            ])
            table = db.create_table("data", data=[], schema=schema)

        logger.info(f"Created LanceDB table with {n_vectors} rows")

        return {
            'vectors_count': n_vectors,
            'dimensions': dims,
            'path': output_path,
            'indexed': False  # LanceDB handles indexing internally
        }

    def read_dataset(self, dataset_path: str) -> Dict[str, Any]:
        """
        Read a Lance dataset and return metadata.

        Args:
            dataset_path: Path to the Lance dataset

        Returns:
            Dataset metadata
        """
        db = lancedb.connect(dataset_path)
        table = db.open_table("data")

        vectors_count = table.count_rows()
        schema = table.schema

        # Get vector dimensions
        vector_dim = None
        for field in schema:
            if field.name == 'vector':
                if hasattr(field.type, 'list_size'):
                    vector_dim = field.type.list_size

        return {
            'vectors_count': vectors_count,
            'dimensions': vector_dim or 0,
            'schema_names': schema.names,
            'path': dataset_path
        }

    def append_records(
        self,
        dataset_root: str,
        records: List[Dict[str, Any]],
        expected_dims: int | None = None,
    ) -> Dict[str, Any]:
        """
        Append records to an existing LanceDB table.

        Args:
            dataset_root: Root path used by lancedb.connect
            records: List of dict rows with a `vector` field
            expected_dims: Optional expected vector dimensions

        Returns:
            Summary metadata after append
        """
        db = lancedb.connect(dataset_root)
        table_names = self._list_tables(db)
        if not table_names:
            raise ValueError(f"No Lance table found at {dataset_root}")

        table_name = table_names[0]
        table = db.open_table(table_name)
        schema_dims = self._vector_dims_from_schema(table.schema)

        if expected_dims and schema_dims and int(expected_dims) != int(schema_dims):
            raise ValueError(
                f"Dimension mismatch for {dataset_root}: expected {expected_dims}, found {schema_dims}"
            )

        if records:
            # Validate vector dimensions before append to catch malformed payloads early.
            reference_dims = schema_dims or int(expected_dims or 0)
            if reference_dims > 0:
                for idx, record in enumerate(records):
                    vector = record.get("vector")
                    if not isinstance(vector, list):
                        raise ValueError(f"Record {idx} missing vector list")
                    if len(vector) != reference_dims:
                        raise ValueError(
                            f"Record {idx} vector dims mismatch: expected {reference_dims}, got {len(vector)}"
                        )
            table.add(records)

        vectors_count = int(table.count_rows())
        return {
            "table_name": table_name,
            "vectors_count": vectors_count,
            "dimensions": schema_dims or int(expected_dims or 0),
            "path": dataset_root,
            "appended": len(records),
        }

# Global instance
_lance_service: LanceService | None = None

def get_lance_service() -> LanceService:
    """Get or create global Lance service instance"""
    global _lance_service
    if _lance_service is None:
        _lance_service = LanceService()
    return _lance_service
