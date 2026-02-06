"""
Configuration module for Lance Dataset Service.

Loads OSS credentials from ~/.oss/credentials.json to match Next.js behavior.
Falls back to environment variables if file not found.
"""
from pathlib import Path
import json
import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class OSSConfig:
    """OSS configuration loaded from ~/.oss/credentials.json"""
    access_key_id: str
    access_key_secret: str
    endpoint: str
    region: str
    bucket_name: str

def load_oss_config() -> OSSConfig:
    """
    Load OSS credentials from ~/.oss/credentials.json.
    Matches the behavior of lib/oss-client.ts in Next.js frontend.
    """
    creds_path = Path.home() / '.oss' / 'credentials.json'

    # Try file first (like Next.js getOSSConfig())
    if creds_path.exists():
        with open(creds_path) as f:
            creds = json.load(f)
        return OSSConfig(
            access_key_id=creds['access_key_id'],
            access_key_secret=creds['access_key_secret'],
            endpoint=creds['endpoint'],
            region=creds['region'],
            bucket_name=creds['bucket_name']
        )

    # Fallback to env vars (like Next.js)
    if not all([
        os.environ.get('OSS_ACCESS_KEY_ID'),
        os.environ.get('OSS_ACCESS_KEY_SECRET'),
    ]):
        raise ValueError(
            "OSS credentials not found. "
            "Please create ~/.oss/credentials.json or set OSS_* env vars."
        )

    return OSSConfig(
        access_key_id=os.environ['OSS_ACCESS_KEY_ID'],
        access_key_secret=os.environ['OSS_ACCESS_KEY_SECRET'],
        endpoint=os.environ.get('OSS_ENDPOINT', 'oss-ap-southeast-1.aliyuncs.com'),
        region=os.environ.get('OSS_REGION', 'oss-ap-southeast-1'),
        bucket_name=os.environ.get('OSS_BUCKET', 'denny-test-lance')
    )

# GLM API key
GLM_API_KEY = os.environ.get('GLM_API_KEY', '74830934db8146fb84b2c12daa182d5f.NnK1nfrYHm4Tqdgc')

# Jina API key
JINA_API_KEY = os.environ.get('JINA_API_KEY', 'jina_4d22586fca5140e99831e91c67f7b09aBX3XfmHSkXlBEhn3PvJna9cZYOXb')
