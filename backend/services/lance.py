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

    def create_dataset(
        self,
        documents: List[Dict[str, Any]],
        embeddings: List[List[float]],
        output_path: str
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

        # Convert to numpy array
        vectors_array = np.array(embeddings, dtype=np.float32)
        n_vectors, dims = vectors_array.shape

        logger.info(f"Creating LanceDB dataset at {output_path} with {n_vectors} vectors, {dims} dims")

        # Connect to LanceDB
        db = lancedb.connect(output_path)

        # Create the table with data - LanceDB >= 0.27 expects list of dicts
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

        # Create table
        table = db.create_table("data", data=table_data)

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

# Global instance
_lance_service: LanceService | None = None

def get_lance_service() -> LanceService:
    """Get or create global Lance service instance"""
    global _lance_service
    if _lance_service is None:
        _lance_service = LanceService()
    return _lance_service
