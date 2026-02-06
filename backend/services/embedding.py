"""
Embedding service for generating vectors using Jina API.

Used for generating query embeddings in hybrid search
and document embeddings during dataset generation.
"""
import httpx
import logging
from typing import List
from config import JINA_API_KEY

logger = logging.getLogger(__name__)

class EmbeddingService:
    """Service for generating embeddings using Jina API"""

    def __init__(self, api_key: str = JINA_API_KEY):
        self.api_key = api_key
        self.base_url = "https://api.jina.ai/v1/embeddings"

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
        async with httpx.AsyncClient(timeout=30.0) as client:
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

            if response.status_code != 200:
                error_text = response.text
                logger.error(f"Jina API error: {response.status_code} - {error_text}")
                raise ValueError(f"Jina API error: {response.status_code} - {error_text}")

            data = response.json()

            if not data.get("data") or not data["data"][0].get("embedding"):
                raise ValueError("Invalid response format from Jina API")

            return data["data"][0]["embedding"]

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors
        """
        embeddings = []

        for i, text in enumerate(texts):
            try:
                embedding = await self.generate_embedding(text)
                embeddings.append(embedding)

                # Rate limiting delay
                if i < len(texts) - 1:
                    import asyncio
                    await asyncio.sleep(0.1)

            except Exception as e:
                logger.error(f"Failed to generate embedding for text {i}: {e}")
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
