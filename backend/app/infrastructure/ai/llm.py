"""LLM adapters — implements the LLM domain port.

Supports Gemini (google-generativeai) and Ollama (local, via httpx).
Both expose the same interface:
  async generate(system, messages, **opts) -> str
  async stream(system, messages, **opts) -> AsyncIterator[str]

Use get_llm() factory to get the configured provider.
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("ai.llm")


class GeminiLLM:
    """Implements domain LLM port using Google Gemini."""

    def __init__(self, temperature: float | None = None, max_tokens: int | None = None) -> None:
        cfg = get_settings()
        self._api_key = cfg.gemini_api_key
        self._model_name = cfg.gemini_model
        self._temperature = (
            temperature if temperature is not None else cfg.rag_generation_temperature
        )
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


class OllamaLLM:
    """Implements domain LLM port using a local Ollama instance."""

    def __init__(self, temperature: float | None = None, max_tokens: int | None = None) -> None:
        cfg = get_settings()
        self._base_url = cfg.ollama_base_url
        self._model = cfg.ollama_model
        self._temperature = (
            temperature if temperature is not None else cfg.rag_generation_temperature
        )
        self._max_tokens = max_tokens or cfg.rag_generation_max_tokens

    def _build_messages(self, system: str, messages: list[dict]) -> list[dict]:
        result = []
        if system:
            result.append({"role": "system", "content": system})
        for msg in messages:
            result.append({"role": msg["role"], "content": msg["content"]})
        return result

    async def generate(self, system: str, messages: list[dict], **opts) -> str:
        payload = {
            "model": self._model,
            "messages": self._build_messages(system, messages),
            "stream": False,
            "options": {"temperature": self._temperature, "num_predict": self._max_tokens},
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{self._base_url}/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json()["message"]["content"]

    async def stream(self, system: str, messages: list[dict], **opts) -> AsyncIterator[str]:
        payload = {
            "model": self._model,
            "messages": self._build_messages(system, messages),
            "stream": True,
            "options": {"temperature": self._temperature, "num_predict": self._max_tokens},
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", f"{self._base_url}/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break


def get_llm(
    temperature: float | None = None, max_tokens: int | None = None
) -> GeminiLLM | OllamaLLM:
    """Return the configured LLM adapter."""
    cfg = get_settings()
    if cfg.llm_provider == "ollama":
        return OllamaLLM(temperature=temperature, max_tokens=max_tokens)
    return GeminiLLM(temperature=temperature, max_tokens=max_tokens)
