"""Gemini LLM adapter — implements the LLM domain port.

Uses google-generativeai SDK. Supports:
- Sync generation for internal use (validation, compression, rewriting)
- Async streaming for user-facing responses
- Configurable temperature and token budget
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("ai.llm")


class GeminiLLM:
    """Implements domain LLM port using Google Gemini."""

    def __init__(self, temperature: float | None = None, max_tokens: int | None = None) -> None:
        cfg = get_settings()
        self._api_key = cfg.gemini_api_key
        self._model_name = cfg.gemini_model
        self._temperature = temperature if temperature is not None else cfg.rag_generation_temperature
        self._max_tokens = max_tokens or cfg.rag_generation_max_tokens
        self._client = None

    def _get_client(self):
        if self._client is None:
            import google.generativeai as genai

            genai.configure(api_key=self._api_key)
            self._client = genai.GenerativeModel(
                model_name=self._model_name,
                generation_config={
                    "temperature": self._temperature,
                    "max_output_tokens": self._max_tokens,
                    "candidate_count": 1,
                },
                safety_settings=[
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                ],
            )
        return self._client

    def _build_contents(self, system: str, messages: list[dict]) -> list:
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        # Gemini doesn't have a separate system role — prepend to first user message.
        if contents and system:
            first_text = contents[0]["parts"][0]["text"]
            contents[0]["parts"][0]["text"] = f"{system}\n\n{first_text}"
        return contents

    async def generate(self, system: str, messages: list[dict], **opts) -> str:
        contents = self._build_contents(system, messages)
        response = await asyncio.to_thread(self._get_client().generate_content, contents)
        return response.text

    async def stream(self, system: str, messages: list[dict], **opts) -> AsyncIterator[str]:
        contents = self._build_contents(system, messages)

        def _sync_stream():
            return self._get_client().generate_content(contents, stream=True)

        stream_obj = await asyncio.to_thread(_sync_stream)
        # Iterate synchronously in a thread to avoid event loop conflicts
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def _producer():
            for chunk in stream_obj:
                if chunk.text:
                    await queue.put(chunk.text)
            await queue.put(None)

        asyncio.create_task(_producer())

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
