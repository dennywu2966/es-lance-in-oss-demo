import unittest
from unittest.mock import AsyncMock, patch

import httpx

from services.embedding import EmbeddingService


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.post_calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False

    async def post(self, *args, **kwargs):
        self.post_calls += 1
        if not self._responses:
            raise RuntimeError("No fake responses left")
        nxt = self._responses.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


class EmbeddingServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_embedding_retries_timeout_then_succeeds(self):
        fake_client = _FakeAsyncClient(
            responses=[
                httpx.ReadTimeout("timed out"),
                _FakeResponse(
                    200,
                    payload={"data": [{"embedding": [0.1, 0.2, 0.3]}]},
                ),
            ]
        )
        service = EmbeddingService(
            api_key="test-key",
            max_retries=2,
            retry_backoff_sec=0.0,
            timeout_sec=5.0,
        )

        with patch("services.embedding.httpx.AsyncClient", return_value=fake_client), patch(
            "services.embedding.asyncio.sleep", new=AsyncMock()
        ):
            embedding = await service.generate_embedding("hello world")

        self.assertEqual([0.1, 0.2, 0.3], embedding)
        self.assertEqual(2, fake_client.post_calls)

    async def test_generate_embedding_does_not_retry_on_bad_request(self):
        fake_client = _FakeAsyncClient(
            responses=[
                _FakeResponse(400, payload={"error": "bad request"}, text="bad request"),
            ]
        )
        service = EmbeddingService(
            api_key="test-key",
            max_retries=3,
            retry_backoff_sec=0.0,
            timeout_sec=5.0,
        )

        with patch("services.embedding.httpx.AsyncClient", return_value=fake_client), patch(
            "services.embedding.asyncio.sleep", new=AsyncMock()
        ):
            with self.assertRaises(ValueError):
                await service.generate_embedding("hello world")

        self.assertEqual(1, fake_client.post_calls)


if __name__ == "__main__":
    unittest.main()
