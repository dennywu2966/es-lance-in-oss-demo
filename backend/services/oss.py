"""
OSS service for managing Lance datasets in Alibaba Cloud OSS.

Provides functionality to list, upload, and delete Lance datasets.
Uses credentials from ~/.oss/credentials.json (via config.py).
"""
import oss2
from config import load_oss_config
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class OSSService:
    """Service for interacting with Alibaba Cloud OSS"""

    def __init__(self):
        self._config = None
        self._bucket = None
        self._auth = None

    @property
    def config(self):
        if self._config is None:
            self._config = load_oss_config()
        return self._config

    @property
    def auth(self):
        if self._auth is None:
            self._auth = oss2.Auth(
                self.config.access_key_id,
                self.config.access_key_secret
            )
        return self._auth

    @property
    def bucket(self):
        if self._bucket is None:
            self._bucket = oss2.Bucket(
                self.auth,
                self.config.endpoint,
                self.config.bucket_name
            )
        return self._bucket

    def list_datasets(self) -> List[Dict]:
        """
        List all Lance datasets in OSS.

        Returns:
            List of datasets with metadata: name, vectors, dims, size, last_modified
        """
        datasets = {}

        try:
            result = self.bucket.list_objects(prefix='datasets/', max_keys=100)

            if not result.object_list:
                return []

            for obj in result.object_list:
                # Parse dataset name from path: datasets/{dataset_name}/...
                parts = obj.key.split('/')
                if len(parts) >= 2 and parts[0] == 'datasets':
                    dataset_name = parts[1]

                    # Parse metadata from filename: vectors-{N}-dims-{D}-{timestamp}
                    if dataset_name not in datasets:
                        import re
                        match = re.match(r'vectors-(\d+)-dims-(\d+)', dataset_name)
                        # Handle both datetime and int timestamp
                        last_modified = (
                            obj.last_modified.isoformat() if hasattr(obj.last_modified, 'isoformat')
                            else obj.last_modified
                        )
                        if match:
                            vectors = int(match.group(1))
                            dims = int(match.group(2))
                            datasets[dataset_name] = {
                                'name': dataset_name,
                                'vectors': vectors,
                                'dims': dims,
                                'size_bytes': obj.size,
                                'size': self._format_bytes(obj.size),
                                'last_modified': last_modified,
                                'file_count': 1
                            }
                        else:
                            datasets[dataset_name] = {
                                'name': dataset_name,
                                'vectors': 0,
                                'dims': 0,
                                'size_bytes': obj.size,
                                'size': self._format_bytes(obj.size),
                                'last_modified': last_modified,
                                'file_count': 1
                            }
                    else:
                        datasets[dataset_name]['file_count'] += 1
                        datasets[dataset_name]['size_bytes'] += obj.size
                        datasets[dataset_name]['size'] = self._format_bytes(
                            datasets[dataset_name]['size_bytes']
                        )

            return sorted(
                list(datasets.values()),
                key=lambda x: x['last_modified'],
                reverse=True
            )

        except Exception as e:
            logger.error(f"Failed to list datasets: {e}")
            raise

    def delete_dataset(self, dataset_name: str) -> bool:
        """
        Delete a dataset and all its files from OSS.

        Args:
            dataset_name: Name of the dataset to delete

        Returns:
            True if successful
        """
        try:
            prefix = f'datasets/{dataset_name}/'
            result = self.bucket.list_objects(prefix=prefix)

            if result.object_list:
                # Delete all objects in the dataset
                for obj in result.object_list:
                    self.bucket.delete_object(obj.key)
                    logger.info(f"Deleted {obj.key}")

            return True

        except Exception as e:
            logger.error(f"Failed to delete dataset {dataset_name}: {e}")
            raise

    def upload_dataset(self, local_path: str, dataset_name: str) -> Dict[str, str]:
        """
        Upload a Lance dataset from local path to OSS.

        Args:
            local_path: Path to local Lance dataset
            dataset_name: Name for the dataset in OSS

        Returns:
            Upload summary
        """
        import os
        from pathlib import Path

        try:
            uploaded_files = []
            total_size = 0

            for root, dirs, files in os.walk(local_path):
                for file in files:
                    local_file = os.path.join(root, file)
                    relative_path = os.path.relpath(local_file, local_path)
                    oss_key = f'datasets/{dataset_name}/{relative_path}'

                    self.bucket.put_object_from_file(oss_key, local_file)
                    uploaded_files.append(oss_key)

                    file_size = os.path.getsize(local_file)
                    total_size += file_size
                    logger.info(f"Uploaded {oss_key} ({self._format_bytes(file_size)})")

            return {
                'dataset_name': dataset_name,
                'files_uploaded': len(uploaded_files),
                'total_size': self._format_bytes(total_size),
                'oss_prefix': f'datasets/{dataset_name}/'
            }

        except Exception as e:
            logger.error(f"Failed to upload dataset: {e}")
            raise

    def download_dataset(self, dataset_name: str, local_path: str) -> str:
        """
        Download a Lance dataset from OSS to local path.

        Args:
            dataset_name: Name of the dataset in OSS
            local_path: Local directory to download to

        Returns:
            Path to downloaded dataset
        """
        import os
        from pathlib import Path

        try:
            prefix = f'datasets/{dataset_name}/'
            result = self.bucket.list_objects(prefix=prefix)

            if not result.object_list:
                raise ValueError(f"Dataset {dataset_name} not found in OSS")

            for obj in result.object_list:
                relative_path = obj.key.replace(prefix, '')
                local_file = os.path.join(local_path, relative_path)

                # Create directory if needed
                os.makedirs(os.path.dirname(local_file), exist_ok=True)

                # Download file
                self.bucket.get_object_to_file(obj.key, local_file)
                logger.info(f"Downloaded {obj.key}")

            return local_path

        except Exception as e:
            logger.error(f"Failed to download dataset {dataset_name}: {e}")
            raise

    def _format_bytes(self, bytes_size: int) -> str:
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_size < 1024:
                return f"{bytes_size:.2f} {unit}"
            bytes_size /= 1024
        return f"{bytes_size:.2f} TB"

# Global instance
_oss_service: Optional[OSSService] = None

def get_oss_service() -> OSSService:
    """Get or create global OSS service instance"""
    global _oss_service
    if _oss_service is None:
        _oss_service = OSSService()
    return _oss_service
