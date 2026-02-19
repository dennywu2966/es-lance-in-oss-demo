"""
Dataset generation routes for FastAPI.

Handles background dataset generation with SSE streaming for progress updates.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Callable, Dict, Any
import logging
import asyncio
import tempfile
import shutil
import os
import json
import re
from pathlib import Path
import time
import httpx

from config import load_oss_config, GLM_API_KEY
from services import get_oss_service, get_embedding_service, get_lance_service, get_job_queue
from services.dataset_append import append_documents_to_local_dataset, validate_target_shard_id
from services.sharding import split_documents_by_shard

logger = logging.getLogger(__name__)
router = APIRouter()


def dataset_index_name(dataset_name: str) -> str:
    sanitized = re.sub(r"[^a-z0-9-]", "-", str(dataset_name or "").lower())
    sanitized = re.sub(r"-+", "-", sanitized).strip("-")
    return f"lance-ds-{sanitized or 'unknown'}"


async def delete_es_index_for_dataset(dataset_name: str) -> dict:
    es_index = dataset_index_name(dataset_name)
    es_host = os.getenv("ES_HOST", "https://127.0.0.1:9200").rstrip("/")
    es_user = os.getenv("ES_USER", "elastic")
    es_password = os.getenv("ES_PASSWORD", "Summer11")

    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            response = await client.delete(
                f"{es_host}/{es_index}",
                auth=(es_user, es_password),
            )

        if response.status_code in (200, 202):
            return {"success": True, "index": es_index, "status": response.status_code, "missing": False}
        if response.status_code == 404:
            return {"success": True, "index": es_index, "status": 404, "missing": True}

        return {
            "success": False,
            "index": es_index,
            "status": response.status_code,
            "error": response.text[:400],
        }
    except Exception as e:
        logger.error(f"Failed to delete ES index for dataset {dataset_name}: {e}")
        return {"success": False, "index": es_index, "status": 0, "error": str(e)}


def _decode_oss_content(raw: Any) -> str:
    if isinstance(raw, bytes):
        return raw.decode("utf-8")
    if isinstance(raw, str):
        return raw
    if raw is None:
        return ""
    return str(raw)


def load_dataset_metadata_from_oss(dataset_name: str) -> Dict[str, Any]:
    oss_service = get_oss_service()
    meta_key = f"datasets/{dataset_name}/dataset.meta.json"
    try:
        obj = oss_service.bucket.get_object(meta_key)
        raw = obj.read()
        decoded = _decode_oss_content(raw)
        if not decoded.strip():
            return {}
        return json.loads(decoded)
    except Exception:
        return {}


def normalize_dataset_profile(dataset_name: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    strategy = str(metadata.get("sharding_strategy", "NONE")).upper()
    if strategy not in ("NONE", "ES_ROUTING"):
        strategy = "NONE"

    shard_count_raw = metadata.get("shard_count", 1)
    try:
        shard_count = max(1, int(shard_count_raw))
    except Exception:
        shard_count = 1

    dims_raw = metadata.get("dims", 768)
    try:
        dims = max(1, int(dims_raw))
    except Exception:
        dims = 768

    return {
        "dataset": dataset_name,
        "dims": dims,
        "shard_count": shard_count,
        "sharding_strategy": strategy,
        "dataset_name": str(metadata.get("dataset_name") or "data.lance"),
        "shard_path": str(metadata.get("shard_path") or "shard-{shard_id}"),
    }

# Request/Response Models
class DatasetGenerateRequest(BaseModel):
    vectors: int = 10
    dims: int = 768
    shard_count: int = 1
    sharding_strategy: str = "NONE"


class DatasetAppendRequest(BaseModel):
    dataset: str
    vectors: int = 10
    target_shard_id: Optional[int] = None

class DatasetListResponse(BaseModel):
    success: bool
    datasets: list
    count: int

class JobResponse(BaseModel):
    success: bool
    job_id: str
    message: str

# GLM API integration
async def generate_documents_with_glm(
    count: int,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> list:
    """Generate fake documents using GLM API"""
    documents = []
    topics = [
        'Vector Databases', 'Machine Learning', 'Elasticsearch', 'Cloud Computing',
        'Neural Networks', 'Natural Language Processing', 'DevOps', 'Data Engineering',
        'Microservices', 'Deep Learning'
    ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(count):
            topic = topics[i % len(topics)]

            try:
                response = await client.post(
                    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {GLM_API_KEY}',
                    },
                    json={
                        'model': 'GLM-4-Flash',
                        'messages': [{
                            'role': 'user',
                            'content': f'Generate a short technical document (150-200 words) about {topic}. Include a title and the main content. Return as JSON with "title" and "text" fields.'
                        }],
                        'temperature': 0.7,
                        'max_tokens': 500,
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data['choices'][0]['message']['content']

                    # Try to parse JSON from response
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', content)
                    if json_match:
                        doc_content = json.loads(json_match.group())
                        documents.append({
                            '_id': f'doc_{i:04d}',
                            'id': f'doc_{i:04d}',
                            'title': doc_content.get('title', f'{topic} Overview'),
                            'text': doc_content.get('text', content),
                            'topic': topic,
                            'category': topic
                        })
                    else:
                        # Fallback
                        documents.append({
                            '_id': f'doc_{i:04d}',
                            'id': f'doc_{i:04d}',
                            'title': f'{topic} - Document {i}',
                            'text': content,
                            'topic': topic,
                            'category': topic
                        })
                else:
                    # Fallback on error
                    documents.append({
                        '_id': f'doc_{i:04d}',
                        'id': f'doc_{i:04d}',
                        'title': f'{topic} - Article {i}',
                        'text': f'Document about {topic} concepts, implementations, and best practices.',
                        'topic': topic,
                        'category': topic
                    })

                # Rate limiting
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"Failed to generate document {i}: {e}")
                documents.append({
                    '_id': f'doc_{i:04d}',
                    'id': f'doc_{i:04d}',
                    'title': f'{topic} - Article {i}',
                    'text': f'Document about {topic} concepts.',
                    'topic': topic,
                    'category': topic
                })
            finally:
                if on_progress:
                    on_progress(i + 1, count)

    return documents

# Background worker for dataset generation
async def generate_dataset_worker(
    job_id: str,
    vectors: int,
    dims: int,
    shard_count: int,
    sharding_strategy: str,
):
    """Background worker that generates the dataset"""
    job_queue = get_job_queue()
    oss_service = get_oss_service()
    embedding_service = get_embedding_service()
    lance_service = get_lance_service()

    temp_dir = None

    try:
        def stage_progress(stage_start: float, stage_end: float, current: int, total: int) -> float:
            if total <= 0:
                return stage_end
            ratio = min(1.0, max(0.0, float(current) / float(total)))
            return stage_start + (stage_end - stage_start) * ratio

        # Update progress
        job_queue.update_progress(job_id, 5, "running", f"Generating documents with GLM API (0/{vectors})")

        # Generate documents
        documents = await generate_documents_with_glm(
            vectors,
            on_progress=lambda current, total: job_queue.update_progress(
                job_id,
                stage_progress(5, 30, current, total),
                "running",
                f"Generating documents with GLM API ({current}/{total})",
            ),
        )
        job_queue.update_progress(job_id, 30, "running", f"Generated {len(documents)} documents")

        # Generate embeddings
        job_queue.update_progress(job_id, 35, "running", f"Generating embeddings with Jina API (0/{len(documents)})")

        texts = [doc['text'] for doc in documents]
        embeddings = await embedding_service.generate_embeddings_batch(
            texts,
            on_progress=lambda current, total: job_queue.update_progress(
                job_id,
                stage_progress(35, 60, current, total),
                "running",
                f"Generating embeddings with Jina API ({current}/{total})",
            ),
        )

        if not embeddings or not embeddings[0]:
            raise ValueError("Embedding generation returned empty vectors")

        actual_dims = len(embeddings[0])
        if actual_dims != int(dims):
            logger.warning(
                "Requested dims=%s but embedding model returned dims=%s; using actual embedding dims",
                dims,
                actual_dims,
            )

        job_queue.update_progress(job_id, 60, "running", f"Generated {len(embeddings)} embeddings ({actual_dims} dims)")

        # Create Lance dataset
        temp_dir = tempfile.mkdtemp(prefix='lance-gen-')
        normalized_strategy = (sharding_strategy or "NONE").upper()
        if normalized_strategy not in ("NONE", "ES_ROUTING"):
            raise ValueError(f"Unsupported sharding_strategy: {sharding_strategy}")

        shard_count = max(1, int(shard_count))
        strategy_slug = normalized_strategy.lower().replace('_', '-')
        dataset_name = f'vectors-{vectors}-dims-{actual_dims}-shards-{shard_count}-{strategy_slug}-{int(time.time())}'
        local_root = Path(temp_dir) / dataset_name
        dataset_filename = "data.lance"

        job_queue.update_progress(job_id, 65, "running", "Creating Lance dataset(s)")

        is_shard_aware_layout = shard_count > 1 or normalized_strategy == "ES_ROUTING"
        if is_shard_aware_layout:
            shard_payload = split_documents_by_shard(
                documents=documents,
                embeddings=embeddings,
                shard_count=shard_count,
                sharding_strategy=normalized_strategy,
            )
            shard_ids = sorted(shard_payload.keys())
            total_shards = max(1, len(shard_ids))
            for position, shard_id in enumerate(shard_ids, start=1):
                shard_docs = shard_payload[shard_id]["documents"]
                shard_vectors = shard_payload[shard_id]["embeddings"]
                # LanceDB create_table writes "<root>/data.lance/*".
                # Pass shard root (not ".../data.lance") to avoid nested "data.lance/data.lance".
                shard_local_path = local_root / f"shard-{shard_id}"
                lance_service.create_dataset(
                    shard_docs,
                    shard_vectors,
                    str(shard_local_path),
                    expected_dims=actual_dims,
                )
                shard_progress = stage_progress(65, 78, position, total_shards)
                job_queue.update_progress(
                    job_id,
                    shard_progress,
                    "running",
                    f"Creating shard dataset ({position}/{total_shards})",
                )
        else:
            # Same contract for single-shard layout: root contains "data.lance/*".
            legacy_local_path = local_root
            lance_service.create_dataset(
                documents,
                embeddings,
                str(legacy_local_path),
                expected_dims=actual_dims,
            )
            job_queue.update_progress(job_id, 78, "running", "Lance dataset created, preparing OSS upload")

        if is_shard_aware_layout:
            job_queue.update_progress(job_id, 78, "running", "Shard-aware Lance datasets created, preparing OSS upload")
        job_queue.update_progress(job_id, 80, "running", "Uploading to OSS")

        # Upload to OSS
        dataset_profile = {
            'version': 1,
            'dataset': dataset_name,
            'vectors': vectors,
            'dims': actual_dims,
            'shard_count': shard_count,
            'sharding_strategy': normalized_strategy,
            'dataset_name': dataset_filename,
        }
        if is_shard_aware_layout:
            oss_config = load_oss_config()
            dataset_profile.update({
                'uri_prefix': f'oss://{oss_config.bucket_name}/datasets/{dataset_name}',
                'shard_path': 'shard-{shard_id}',
            })
        upload_result = oss_service.upload_dataset(str(local_root), dataset_name, metadata=dataset_profile)

        job_queue.update_progress(job_id, 90, "running", "Upload completed, validating dataset metadata")
        job_queue.update_progress(job_id, 95, "running", "Finalizing")

        # Complete job
        job_queue.complete_job(job_id, {
            'dataset_name': dataset_name,
            'vectors': vectors,
            'dims': actual_dims,
            'shard_count': shard_count,
            'sharding_strategy': normalized_strategy,
            'upload_result': upload_result
        })

    except Exception as e:
        logger.error(f"Dataset generation failed: {e}")
        job_queue.fail_job(job_id, str(e))

    finally:
        # Cleanup temp directory
        if temp_dir and Path(temp_dir).exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


async def append_dataset_worker(
    job_id: str,
    dataset_name: str,
    vectors: int,
    target_shard_id: Optional[int],
):
    """Background worker that appends new vectors/documents to an existing dataset."""
    job_queue = get_job_queue()
    oss_service = get_oss_service()
    embedding_service = get_embedding_service()
    lance_service = get_lance_service()

    temp_dir = None

    try:
        def stage_progress(stage_start: float, stage_end: float, current: int, total: int) -> float:
            if total <= 0:
                return stage_end
            ratio = min(1.0, max(0.0, float(current) / float(total)))
            return stage_start + (stage_end - stage_start) * ratio

        if vectors <= 0:
            raise ValueError("vectors must be > 0")

        profile_metadata = load_dataset_metadata_from_oss(dataset_name)
        profile = normalize_dataset_profile(dataset_name, profile_metadata)

        normalized_target_shard = validate_target_shard_id(target_shard_id, profile["shard_count"])

        # Verify dataset exists before doing expensive work.
        list_result = oss_service.bucket.list_objects(prefix=f"datasets/{dataset_name}/", max_keys=5)
        if not list_result.object_list:
            raise ValueError(f"Dataset not found in OSS: {dataset_name}")

        temp_dir = tempfile.mkdtemp(prefix="lance-append-")
        local_root = Path(temp_dir) / dataset_name

        job_queue.update_progress(job_id, 5, "running", "Downloading dataset from OSS")
        oss_service.download_dataset(dataset_name, str(local_root))
        job_queue.update_progress(job_id, 20, "running", "Dataset downloaded")

        # Generate new documents.
        job_queue.update_progress(job_id, 22, "running", f"Generating append documents (0/{vectors})")
        documents = await generate_documents_with_glm(
            vectors,
            on_progress=lambda current, total: job_queue.update_progress(
                job_id,
                stage_progress(22, 45, current, total),
                "running",
                f"Generating append documents ({current}/{total})",
            ),
        )
        job_queue.update_progress(job_id, 45, "running", f"Generated {len(documents)} documents for append")

        # Generate embeddings for new docs.
        texts = [doc["text"] for doc in documents]
        job_queue.update_progress(job_id, 48, "running", f"Generating embeddings (0/{len(texts)})")
        embeddings = await embedding_service.generate_embeddings_batch(
            texts,
            on_progress=lambda current, total: job_queue.update_progress(
                job_id,
                stage_progress(48, 72, current, total),
                "running",
                f"Generating embeddings ({current}/{total})",
            ),
        )
        if not embeddings or not embeddings[0]:
            raise ValueError("Embedding generation returned empty vectors")

        actual_dims = len(embeddings[0])
        if int(profile["dims"]) != actual_dims:
            raise ValueError(
                f'Embedding dims mismatch for dataset "{dataset_name}": dataset dims={profile["dims"]}, append dims={actual_dims}'
            )

        job_queue.update_progress(job_id, 72, "running", "Appending rows to local Lance dataset shards")

        append_summary = append_documents_to_local_dataset(
            lance_service=lance_service,
            local_dataset_root=local_root,
            documents=documents,
            embeddings=embeddings,
            shard_count=profile["shard_count"],
            sharding_strategy=profile["sharding_strategy"],
            dims=actual_dims,
            target_shard_id=normalized_target_shard,
            shard_path_template=profile.get("shard_path"),
            index_name=dataset_index_name(dataset_name),
        )
        appended = int(append_summary.get("appended", 0))
        shard_updates = append_summary.get("shard_updates", {})

        job_queue.update_progress(job_id, 84, "running", "Uploading updated dataset to OSS")

        old_vectors = int(profile_metadata.get("vectors", 0)) if str(profile_metadata.get("vectors", "")).isdigit() else 0
        total_vectors = old_vectors + appended if old_vectors > 0 else appended

        updated_metadata = {
            **profile_metadata,
            "version": int(profile_metadata.get("version", 1) or 1),
            "dataset": dataset_name,
            "vectors": total_vectors,
            "dims": actual_dims,
            "shard_count": profile["shard_count"],
            "sharding_strategy": profile["sharding_strategy"],
            "dataset_name": profile.get("dataset_name") or "data.lance",
            "shard_path": profile.get("shard_path") or "shard-{shard_id}",
        }

        upload_result = oss_service.upload_dataset(str(local_root), dataset_name, metadata=updated_metadata)
        job_queue.update_progress(job_id, 95, "running", "Finalizing append job")

        job_queue.complete_job(
            job_id,
            {
                "dataset_name": dataset_name,
                "appended_vectors": appended,
                "total_vectors": total_vectors,
                "dims": actual_dims,
                "shard_count": profile["shard_count"],
                "sharding_strategy": profile["sharding_strategy"],
                "target_shard_id": normalized_target_shard,
                "shard_updates": shard_updates,
                "upload_result": upload_result,
            },
        )
    except Exception as e:
        logger.error(f"Dataset append failed: {e}")
        job_queue.fail_job(job_id, str(e))
    finally:
        if temp_dir and Path(temp_dir).exists():
            shutil.rmtree(temp_dir, ignore_errors=True)

# Routes
@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets():
    """List all Lance datasets in OSS"""
    try:
        oss_service = get_oss_service()
        datasets = oss_service.list_datasets()

        return DatasetListResponse(
            success=True,
            datasets=datasets,
            count=len(datasets)
        )
    except Exception as e:
        logger.error(f"Failed to list datasets: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dataset/generate", response_model=JobResponse)
async def generate_dataset(request: DatasetGenerateRequest):
    """
    Start a background job to generate a new Lance dataset.

    The job will:
    1. Generate documents using GLM API
    2. Generate embeddings using Jina API
    3. Create Lance dataset with IVF-PQ index
    4. Upload to OSS

    Returns a job_id for streaming progress updates.
    """
    try:
        job_queue = get_job_queue()
        job_id = job_queue.create_job('dataset_generate')

        # Start background worker
        normalized_strategy = (request.sharding_strategy or "NONE").upper()
        if normalized_strategy not in ("NONE", "ES_ROUTING"):
            raise HTTPException(status_code=400, detail="sharding_strategy must be NONE or ES_ROUTING")

        shard_count = max(1, request.shard_count)

        asyncio.create_task(
            generate_dataset_worker(job_id, request.vectors, request.dims, shard_count, normalized_strategy)
        )

        return JobResponse(
            success=True,
            job_id=job_id,
            message="Dataset generation job started"
        )

    except Exception as e:
        logger.error(f"Failed to start dataset generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dataset/append", response_model=JobResponse)
async def append_dataset(request: DatasetAppendRequest):
    """
    Start a background job to append vectors/documents to an existing Lance dataset.

    The job will:
    1. Download the target dataset from OSS
    2. Generate new documents + embeddings
    3. Append rows into target shard(s) while preserving layout
    4. Upload updated dataset + metadata back to OSS
    """
    try:
        dataset_name = (request.dataset or "").strip()
        if not dataset_name:
            raise HTTPException(status_code=400, detail="dataset is required")
        if request.vectors <= 0:
            raise HTTPException(status_code=400, detail="vectors must be > 0")

        profile_metadata = load_dataset_metadata_from_oss(dataset_name)
        profile = normalize_dataset_profile(dataset_name, profile_metadata)
        validate_target_shard_id(request.target_shard_id, profile["shard_count"])

        job_queue = get_job_queue()
        job_id = job_queue.create_job("dataset_append")

        asyncio.create_task(
            append_dataset_worker(
                job_id=job_id,
                dataset_name=dataset_name,
                vectors=request.vectors,
                target_shard_id=request.target_shard_id,
            )
        )

        return JobResponse(
            success=True,
            job_id=job_id,
            message="Dataset append job started",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start dataset append: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dataset/status/{job_id}")
async def get_job_status(job_id: str):
    """Get the current status of a background job"""
    try:
        job_queue = get_job_queue()
        job = job_queue.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return {
            'id': job.id,
            'type': job.type,
            'status': job.status,
            'progress': job.progress,
            'result': job.result,
            'error': job.error,
            'created_at': job.created_at.isoformat(),
            'updated_at': job.updated_at.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dataset/stream/{job_id}")
async def stream_job_progress(job_id: str):
    """
    Stream job progress as Server-Sent Events.

    Client can subscribe to this endpoint for real-time updates:
    - Connect with EventSource or SSE client
    - Receives progress updates every 0.5s
    - Stream closes when job completes or fails
    """
    job_queue = get_job_queue()

    # Verify job exists
    job = job_queue.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return StreamingResponse(
        job_queue.stream_job(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@router.delete("/dataset/{dataset_name}")
async def delete_dataset(dataset_name: str):
    """Delete a dataset from OSS and clean the corresponding per-dataset ES index."""
    try:
        oss_service = get_oss_service()
        success = oss_service.delete_dataset(dataset_name)
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to delete dataset from OSS: {dataset_name}")

        es_cleanup = await delete_es_index_for_dataset(dataset_name)
        if not es_cleanup.get("success"):
            cleanup_error = es_cleanup.get("error") or f'HTTP {es_cleanup.get("status")}'
            raise HTTPException(
                status_code=500,
                detail=(
                    f'Dataset "{dataset_name}" deleted from OSS but failed to clean ES index '
                    f'"{es_cleanup.get("index")}": {cleanup_error}'
                ),
            )

        return {
            'success': True,
            'dataset_name': dataset_name,
            'es_index': es_cleanup.get("index"),
            'es_index_deleted': not bool(es_cleanup.get("missing")),
            'es_index_missing': bool(es_cleanup.get("missing")),
        }

    except Exception as e:
        logger.error(f"Failed to delete dataset: {e}")
        raise HTTPException(status_code=500, detail=str(e))
