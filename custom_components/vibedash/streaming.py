"""Streaming LLM clients for VibeDash.

Provides async generators that yield text chunks from various LLM providers.
All providers use aiohttp (already available in HA) — no extra dependencies.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

from aiohttp import ClientSession, ClientTimeout

from .const import (
    DEFAULT_BASE_URLS,
    DEFAULT_MODELS,
    STREAMING_PROVIDER_ANTHROPIC,
    STREAMING_PROVIDER_GEMINI,
    STREAMING_PROVIDER_OLLAMA,
    STREAMING_PROVIDER_OPENAI,
    STREAMING_PROVIDER_OPENROUTER,
)

_LOGGER = logging.getLogger(__name__)

# Timeout for streaming requests (5 min to allow long generations)
_TIMEOUT = ClientTimeout(total=300, connect=30)


async def stream_llm_response(
    provider: str,
    api_key: str,
    prompt: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    system_prompt: str | None = None,
) -> AsyncGenerator[str]:
    """Stream text chunks from an LLM provider.

    Yields text delta strings as they arrive from the provider.
    """
    model = model or DEFAULT_MODELS.get(provider, "")
    base_url = base_url or DEFAULT_BASE_URLS.get(provider, "")

    if provider == STREAMING_PROVIDER_ANTHROPIC:
        async for chunk in _stream_anthropic(api_key, prompt, model, base_url):
            yield chunk
    elif provider == STREAMING_PROVIDER_GEMINI:
        async for chunk in _stream_gemini(api_key, prompt, model, base_url):
            yield chunk
    elif provider == STREAMING_PROVIDER_OLLAMA:
        async for chunk in _stream_ollama(prompt, model, base_url):
            yield chunk
    elif provider in (STREAMING_PROVIDER_OPENAI, STREAMING_PROVIDER_OPENROUTER):
        async for chunk in _stream_openai_compatible(
            api_key, prompt, model, base_url, provider
        ):
            yield chunk
    else:
        raise ValueError(f"Unknown streaming provider: {provider}")


async def validate_provider(
    provider: str,
    api_key: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
) -> tuple[bool, str]:
    """Validate that a streaming provider is reachable and the API key works.

    Returns (success, error_message).
    """
    model = model or DEFAULT_MODELS.get(provider, "")
    base_url = base_url or DEFAULT_BASE_URLS.get(provider, "")

    try:
        if provider == STREAMING_PROVIDER_ANTHROPIC:
            return await _validate_anthropic(api_key, base_url)
        if provider == STREAMING_PROVIDER_GEMINI:
            return await _validate_gemini(api_key, base_url)
        if provider == STREAMING_PROVIDER_OLLAMA:
            return await _validate_ollama(base_url)
        if provider in (STREAMING_PROVIDER_OPENAI, STREAMING_PROVIDER_OPENROUTER):
            return await _validate_openai_compatible(api_key, base_url)
        return False, f"Unknown provider: {provider}"
    except Exception as exc:
        return False, f"Connection failed: {exc}"


# ---------------------------------------------------------------------------
# OpenAI-compatible (OpenAI, OpenRouter)
# ---------------------------------------------------------------------------


async def _stream_openai_compatible(
    api_key: str,
    prompt: str,
    model: str,
    base_url: str,
    provider: str,
) -> AsyncGenerator[str]:
    """Stream from OpenAI-compatible APIs (OpenAI, OpenRouter)."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == STREAMING_PROVIDER_OPENROUTER:
        headers["HTTP-Referer"] = "https://github.com/MatijaMaric/hass-vibedash"
        headers["X-Title"] = "VibeDash"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }

    async with ClientSession(timeout=_TIMEOUT) as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"API error {resp.status}: {body[:500]}")

            async for line in resp.content:
                decoded = line.decode("utf-8").strip()
                if not decoded or not decoded.startswith("data: "):
                    continue
                data = decoded[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = (
                        chunk.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )
                    if delta:
                        yield delta
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue


async def _validate_openai_compatible(api_key: str, base_url: str) -> tuple[bool, str]:
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with ClientSession(timeout=ClientTimeout(total=15)) as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status == 200:
                return True, ""
            body = await resp.text()
            return False, f"API returned {resp.status}: {body[:200]}"


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------


async def _stream_anthropic(
    api_key: str,
    prompt: str,
    model: str,
    base_url: str,
) -> AsyncGenerator[str]:
    """Stream from the Anthropic Messages API."""
    url = f"{base_url.rstrip('/')}/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": 8192,
        "stream": True,
        "messages": [{"role": "user", "content": prompt}],
    }

    async with ClientSession(timeout=_TIMEOUT) as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"Anthropic API error {resp.status}: {body[:500]}")

            async for line in resp.content:
                decoded = line.decode("utf-8").strip()
                if not decoded or not decoded.startswith("data: "):
                    continue
                try:
                    event = json.loads(decoded[6:])
                    if event.get("type") == "content_block_delta":
                        text = event.get("delta", {}).get("text", "")
                        if text:
                            yield text
                    elif event.get("type") == "message_stop":
                        break
                except json.JSONDecodeError:
                    continue


async def _validate_anthropic(api_key: str, base_url: str) -> tuple[bool, str]:
    url = f"{base_url.rstrip('/')}/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    # Send a minimal request to validate the key
    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}],
    }
    async with ClientSession(timeout=ClientTimeout(total=15)) as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status == 200:
                return True, ""
            if resp.status == 401:
                return False, "Invalid API key"
            body = await resp.text()
            return False, f"API returned {resp.status}: {body[:200]}"


# ---------------------------------------------------------------------------
# Google Gemini
# ---------------------------------------------------------------------------


async def _stream_gemini(
    api_key: str,
    prompt: str,
    model: str,
    base_url: str,
) -> AsyncGenerator[str]:
    """Stream from Google Gemini's generateContent API."""
    url = (
        f"{base_url.rstrip('/')}/models/{model}:streamGenerateContent"
        f"?alt=sse&key={api_key}"
    )
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 8192},
    }

    async with ClientSession(timeout=_TIMEOUT) as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"Gemini API error {resp.status}: {body[:500]}")

            async for line in resp.content:
                decoded = line.decode("utf-8").strip()
                if not decoded or not decoded.startswith("data: "):
                    continue
                try:
                    chunk = json.loads(decoded[6:])
                    parts = (
                        chunk.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [])
                    )
                    for part in parts:
                        text = part.get("text", "")
                        if text:
                            yield text
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue


async def _validate_gemini(api_key: str, base_url: str) -> tuple[bool, str]:
    url = f"{base_url.rstrip('/')}/models?key={api_key}"
    async with ClientSession(timeout=ClientTimeout(total=15)) as session:
        async with session.get(url) as resp:
            if resp.status == 200:
                return True, ""
            body = await resp.text()
            return False, f"API returned {resp.status}: {body[:200]}"


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------


async def _stream_ollama(
    prompt: str,
    model: str,
    base_url: str,
) -> AsyncGenerator[str]:
    """Stream from Ollama's chat API."""
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }

    async with ClientSession(timeout=_TIMEOUT) as session:
        async with session.post(url, json=payload) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"Ollama API error {resp.status}: {body[:500]}")

            async for line in resp.content:
                decoded = line.decode("utf-8").strip()
                if not decoded:
                    continue
                try:
                    chunk = json.loads(decoded)
                    text = chunk.get("message", {}).get("content", "")
                    if text:
                        yield text
                    if chunk.get("done"):
                        break
                except json.JSONDecodeError:
                    continue


async def _validate_ollama(base_url: str) -> tuple[bool, str]:
    url = f"{base_url.rstrip('/')}/api/tags"
    async with ClientSession(timeout=ClientTimeout(total=10)) as session:
        try:
            async with session.get(url) as resp:
                if resp.status == 200:
                    return True, ""
                return False, f"Ollama returned {resp.status}"
        except Exception as exc:
            return False, f"Cannot reach Ollama at {base_url}: {exc}"
