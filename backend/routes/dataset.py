"""
Dataset generation routes for FastAPI.

Handles background dataset generation with SSE streaming for progress updates.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import logging
import asyncio
import tempfile
import shutil
from pathlib import Path

from config import load_oss_config, GLM_API_KEY
from services import get_oss_service, get_embedding_service, get_lance_service, get_job_queue

logger = logging.getLogger(__name__)
router = APIRouter()

# Request/Response Models
class DatasetGenerateRequest(BaseModel):
    vectors: int = 10
    dims: int = 768

class DatasetListResponse(BaseModel):
    success: bool
    datasets: list
    count: int

class JobResponse(BaseModel):
    success: bool
    job_id: str
    message: str

# GLM API integration
async def generate_documents_with_glm(count: int) -> list:
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

    return documents

# Background worker for dataset generation
async def generate_dataset_worker(job_id: str, vectors: int, dims: int):
    """Background worker that generates the dataset"""
    job_queue = get_job_queue()
    oss_service = get_oss_service()
    embedding_service = get_embedding_service()
    lance_service = get_lance_service()

    temp_dir = None

    try:
        # Update progress
        job_queue.update_progress(job_id, 5, "running", "Generating documents with GLM API")

        # Generate documents
        documents = await generate_documents_with_glm(vectors)
        job_queue.update_progress(job_id, 30, "running", f"Generated {len(documents)} documents")

        # Generate embeddings
        job_queue.update_progress(job_id, 35, "running", "Generating embeddings with Jina API")

        texts = [doc['text'] for doc in documents]
        embeddings = await embedding_service.generate_embeddings_batch(texts)

        job_queue.update_progress(job_id, 60, "running", f"Generated {len(embeddings)} embeddings")

        # Create Lance dataset
        temp_dir = tempfile.mkdtemp(prefix='lance-gen-')
        dataset_name = f'vectors-{vectors}-dims-{dims}'
        local_path = f'{temp_dir}/{dataset_name}.lance'

        job_queue.update_progress(job_id, 65, "running", "Creating Lance dataset")

        lance_service.create_dataset(documents, embeddings, local_path)

        job_queue.update_progress(job_id, 80, "running", "Uploading to OSS")

        # Upload to OSS
        upload_result = oss_service.upload_dataset(local_path, dataset_name)

        job_queue.update_progress(job_id, 95, "running", "Finalizing")

        # Complete job
        job_queue.complete_job(job_id, {
            'dataset_name': dataset_name,
            'vectors': vectors,
            'dims': dims,
            'upload_result': upload_result
        })

    except Exception as e:
        logger.error(f"Dataset generation failed: {e}")
        job_queue.fail_job(job_id, str(e))

    finally:
        # Cleanup temp directory
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
        asyncio.create_task(
            generate_dataset_worker(job_id, request.vectors, request.dims)
        )

        return JobResponse(
            success=True,
            job_id=job_id,
            message="Dataset generation job started"
        )

    except Exception as e:
        logger.error(f"Failed to start dataset generation: {e}")
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
    """Delete a dataset from OSS"""
    try:
        oss_service = get_oss_service()
        success = oss_service.delete_dataset(dataset_name)

        return {
            'success': success,
            'dataset_name': dataset_name
        }

    except Exception as e:
        logger.error(f"Failed to delete dataset: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Add missing import at top
import httpx
import json
import re
