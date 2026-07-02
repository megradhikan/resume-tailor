"""
Single entry point for all LLM calls in the system.
Every agent imports and calls this — never instantiate a provider
client directly inside an agent file.
"""
from __future__ import annotations

import json
import os
import time
from typing import TypeVar

from groq import Groq
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

_MODEL = "llama-3.3-70b-versatile"
_MAX_RETRIES = 3
_RETRY_DELAY = 2.0  # seconds; doubles on each 429
_MAX_OUTPUT_TOKENS = 4096  # cap output to prevent runaway LLM responses


def _get_client() -> Groq:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GROQ_API_KEY not set. Copy .env.example to .env and add your key."
        )
    return Groq(api_key=api_key)


def call_llm(prompt: str, response_schema: type[T]) -> T:
    """
    Call the LLM and return a validated instance of response_schema.

    Handles:
    - Structured JSON output via Groq's JSON mode
    - Validation against the Pydantic schema with retry on malformed output
    - Rate-limit (429) backoff in one place
    """
    client = _get_client()
    schema_json = json.dumps(response_schema.model_json_schema(), indent=2)
    system_message = (
        "You are a precise assistant that always responds with valid JSON "
        "matching the exact schema provided. Never add extra keys. "
        "Never truncate or omit required fields.\n\n"
        f"Respond ONLY with a JSON object matching this schema:\n{schema_json}"
    )

    delay = _RETRY_DELAY
    last_error: Exception | None = None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0,
                timeout=30.0,
                max_tokens=_MAX_OUTPUT_TOKENS,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)
            return response_schema.model_validate(data)

        except ValidationError as e:
            last_error = e
            if attempt < _MAX_RETRIES:
                # Feed the error back so the model can correct itself
                prompt = (
                    prompt
                    + f"\n\nYour previous response failed validation:\n{e}\n"
                    "Fix and return valid JSON only."
                )
                continue
            raise RuntimeError(
                f"LLM output failed Pydantic validation after {_MAX_RETRIES} attempts: {e}"
            ) from e

        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "rate limit" in err_str:
                if attempt < _MAX_RETRIES:
                    time.sleep(delay)
                    delay *= 2
                    last_error = e
                    continue
            # Sanitize provider errors — never propagate raw messages that
            # may contain the API key prefix or internal provider details
            raise RuntimeError("LLM provider error — check server logs for details.") from e

    raise RuntimeError(f"LLM call failed after {_MAX_RETRIES} attempts: {last_error}")
