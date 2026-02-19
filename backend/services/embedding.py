"""
Embedding service for generating vectors using Jina API.

Used for generating query embeddings in hybrid search
and document embeddings during dataset generation.
"""
import asyncio
import httpx
import logging
import os
from typing import Callable, List, Optional
from config import JINA_API_KEY

logger = logging.getLogger(__name__)

class EmbeddingService:
    """Service for generating embeddings using Jina API"""

    def __init__(
        self,
        api_key: str = JINA_API_KEY,
        max_retries: int | None = None,
        retry_backoff_sec: float | None = None,
        timeout_sec: float | None = None,
    ):
        self.api_key = api_key
        self.base_url = "https://api.jina.ai/v1/embeddings"
        self.max_retries = (
            int(os.environ.get("JINA_EMBEDDING_MAX_RETRIES", "3"))
            if max_retries is None
            else max(0, int(max_retries))
        )
        self.retry_backoff_sec = (
            float(os.environ.get("JINA_EMBEDDING_RETRY_BACKOFF_SEC", "0.5"))
            if retry_backoff_sec is None
            else max(0.0, float(retry_backoff_sec))
        )
        self.timeout_sec = (
            float(os.environ.get("JINA_EMBEDDING_TIMEOUT_SEC", "45"))
            if timeout_sec is None
            else max(1.0, float(timeout_sec))
        )

    async def _request_embedding(self, client: httpx.AsyncClient, text: str) -> List[float]:
        """Request one embedding with retry/backoff for transient upstream failures."""
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json={
                        "model": "jina-embeddings-v2-base-en",
                        "input": text,
                        "encoding_type": "float",
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    if not data.get("data") or not data["data"][0].get("embedding"):
                        raise ValueError("Invalid response format from Jina API")
                    return data["data"][0]["embedding"]

                error_text = response.text
                error = ValueError(f"Jina API error: {response.status_code} - {error_text}")
                retryable = response.status_code in (429, 500, 502, 503, 504)
                if (not retryable) or attempt >= self.max_retries:
                    raise error

                last_error = error
                delay = self.retry_backoff_sec * (2 ** attempt)
                logger.warning(
                    "Transient Jina API error (status=%s). Retry %s/%s in %.2fs",
                    response.status_code,
                    attempt + 1,
                    self.max_retries,
                    delay,
                )
                await asyncio.sleep(delay)
                continue

            except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPError) as e:
                last_error = e
                if attempt >= self.max_retries:
                    raise RuntimeError(
                        f"Jina request failed after {self.max_retries + 1} attempts: {type(e).__name__}: {e}"
                    ) from e

                delay = self.retry_backoff_sec * (2 ** attempt)
                logger.warning(
                    "Transient Jina transport error (%s). Retry %s/%s in %.2fs",
                    type(e).__name__,
                    attempt + 1,
                    self.max_retries,
                    delay,
                )
                await asyncio.sleep(delay)

        raise RuntimeError(f"Failed to generate embedding after retries: {last_error}")

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text to embed

        Returns:
            Embedding vector as list of floats

        Raises:
            ValueError: If API returns invalid response
        """
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            return await self._request_embedding(client, text)

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        on_progress: Optional[Callable[[int, int], None]] = None,
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors
        """
        embeddings = []

        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            for i, text in enumerate(texts):
                try:
                    embedding = await self._request_embedding(client, text)
                    embeddings.append(embedding)
                    if on_progress:
                        on_progress(i + 1, len(texts))

                    # Gentle pacing to avoid hammering upstream API.
                    if i < len(texts) - 1:
                        await asyncio.sleep(0.1)

                except Exception as e:
                    logger.error(
                        "Failed to generate embedding for text %s (%s): %r",
                        i,
                        type(e).__name__,
                        e,
                    )
                    raise

        return embeddings

# Global instance
_embedding_service: EmbeddingService | None = None

def get_embedding_service() -> EmbeddingService:
    """Get or create global embedding service instance"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
