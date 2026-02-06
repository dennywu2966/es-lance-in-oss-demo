"""
Background job queue with SSE streaming support.

Handles long-running tasks like dataset generation
with real-time progress updates via Server-Sent Events.
"""
import asyncio
import uuid
import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, AsyncIterator
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class Job:
    """Represents a background job"""
    id: str
    type: str
    status: str = "pending"  # pending, running, completed, failed
    progress: float = 0.0
    result: dict = field(default_factory=dict)
    error: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

class JobQueue:
    """In-memory job queue with SSE streaming support"""

    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        self._subscribers: Dict[str, list] = {}

    def create_job(self, job_type: str) -> str:
        """
        Create a new job.

        Args:
            job_type: Type of job (e.g., 'dataset_generate')

        Returns:
            Job ID
        """
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = Job(id=job_id, type=job_type)
        logger.info(f"Created job {job_id} of type {job_type}")
        return job_id

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get a job by ID"""
        return self.jobs.get(job_id)

    def update_progress(
        self,
        job_id: str,
        progress: float,
        status: str = "running",
        message: str = ""
    ):
        """
        Update job progress.

        Args:
            job_id: Job ID
            progress: Progress percentage (0-100)
            status: Job status
            message: Optional status message
        """
        if job_id in self.jobs:
            self.jobs[job_id].progress = progress
            self.jobs[job_id].status = status
            self.jobs[job_id].updated_at = datetime.now()
            if message:
                self.jobs[job_id].result['message'] = message
            logger.debug(f"Job {job_id}: {progress}% - {status}")

    def complete_job(self, job_id: str, result: dict):
        """Mark a job as completed with results"""
        if job_id in self.jobs:
            self.jobs[job_id].status = "completed"
            self.jobs[job_id].progress = 100.0
            self.jobs[job_id].result.update(result)
            self.jobs[job_id].updated_at = datetime.now()
            logger.info(f"Job {job_id} completed")

    def fail_job(self, job_id: str, error: str):
        """Mark a job as failed"""
        if job_id in self.jobs:
            self.jobs[job_id].status = "failed"
            self.jobs[job_id].error = error
            self.jobs[job_id].updated_at = datetime.now()
            logger.error(f"Job {job_id} failed: {error}")

    async def stream_job(self, job_id: str) -> AsyncIterator[str]:
        """
        Stream job progress as Server-Sent Events.

        Args:
            job_id: Job ID to stream

        Yields:
            SSE formatted data strings
        """
        try:
            while True:
                job = self.get_job(job_id)

                if not job:
                    yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                    break

                data = {
                    'id': job.id,
                    'type': job.type,
                    'status': job.status,
                    'progress': job.progress,
                    'result': job.result,
                    'error': job.error,
                    'created_at': job.created_at.isoformat(),
                    'updated_at': job.updated_at.isoformat()
                }

                yield f"data: {json.dumps(data)}\n\n"

                # End stream if job is complete or failed
                if job.status in ['completed', 'failed']:
                    break

                # Wait before next update
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            logger.info(f"Stream for job {job_id} cancelled")
        except Exception as e:
            logger.error(f"Error streaming job {job_id}: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

# Global instance
_job_queue: JobQueue | None = None

def get_job_queue() -> JobQueue:
    """Get or create global job queue instance"""
    global _job_queue
    if _job_queue is None:
        _job_queue = JobQueue()
    return _job_queue
