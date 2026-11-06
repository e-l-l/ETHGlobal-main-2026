"""Structured-output LLM backends: `AnthropicLLM` (real) and `FakeLLM` (tests).

Both implement `interfaces.LLM`: `parse(system=, user=, schema=, effort=) -> schema instance`.

The real call (verified against anthropic 2.5.0):

    client.beta.messages.parse(
        model=settings.anthropic_model,                      # "claude-opus-5-5"
        max_tokens=16_000,                                   # thinking counts toward this
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
        output_format=schema,                                # Pydantic model -> output_config.format
        output_config={"effort": effort},                    # SDK merges format + effort
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",                                 # server-side refusal fallback
    )

`beta.messages.parse` is used because the non-beta `messages.parse` in this SDK has no
`fallbacks` / `betas` parameters. No `thinking` (always on for Opus 5.5) and no `tool_choice`
(forced tool use 400s on this model). Retries are the SDK default (2, with backoff).
"""

from __future__ import annotations

import json
import logging
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import anthropic
import pydantic
from pydantic import BaseModel

from .config import Settings
from .interfaces import T

log = logging.getLogger(__name__)

EFFORTS = frozenset({"low", "medium", "high", "xhigh", "max"})
FALLBACK_BETA = "server-side-fallback-2026-07-01"  # pairs with fallbacks="default" (array form uses -06-01)
# Thinking tokens count toward max_tokens. The SDK refuses non-streaming calls above ~21k tokens.
DEFAULT_MAX_TOKENS = 16_000

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
DATA_OPEN = "<shop_data>"
DATA_CLOSE = "</shop_data>"


# ---------- errors (most specific first when catching) ----------

class LLMError(Exception):
    """Base for every judge-call failure. The pipeline can catch this one type."""


class LLMRefusalError(LLMError):
    """stop_reason == "refusal" (after the server-side fallback chain, if enabled)."""

    def __init__(self, message: str, *, category: str | None = None, explanation: str | None = None):
        super().__init__(message)
        self.category = category
        self.explanation = explanation


class LLMOutputError(LLMError):
    """The response had no usable structured output (bad JSON, schema mismatch, odd stop_reason)."""


class LLMTruncatedError(LLMOutputError):
    """Output cut off: stop_reason max_tokens / model_context_window_exceeded, or JSON ended early."""


class LLMUnavailableError(LLMError):
    """Transient: connection, timeout, overload, 5xx. Raised after the SDK's own retries."""


class LLMRateLimitError(LLMUnavailableError):
    """429 after the SDK's own retries."""


class LLMRequestError(LLMError):
    """Non-retryable API error (400/401/403/404...). Usually a config or request-shape bug."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


# ---------- helpers shared by the judges ----------

def load_prompt(name: str) -> str:
    """Read a system prompt from prompts/<name>.md (stable text, so it caches)."""
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8").strip()


def data_json(payload: Any) -> str:
    """JSON for a delimited data block. `<`, `>` and `&` are escaped as JSON unicode escapes, so
    untrusted strings (e.g. a shop label containing "</shop_data>") can never close the block.
    `json.loads` returns the original text unchanged."""
    text = json.dumps(payload, ensure_ascii=False, indent=1)
    return text.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")


def data_block(payload: Any, tag: str = "shop_data") -> str:
    """`<tag>` + escaped JSON + `</tag>`. The JSON cannot contain a literal `<`, so it can't close the tag."""
    return f"<{tag}>\n{data_json(payload)}\n</{tag}>"


def _check_effort(effort: str) -> None:
    if effort not in EFFORTS:
        raise ValueError(f"effort must be one of {sorted(EFFORTS)}, got {effort!r}")


def _is_truncated_json(err: pydantic.ValidationError) -> bool:
    return any(e.get("type") == "json_invalid" and "EOF" in str(e.get("msg", "")) for e in err.errors())


# ---------- real backend ----------

class AnthropicLLM:
    """Claude via `client.beta.messages.parse` with structured outputs."""

    def __init__(
        self,
        settings: Settings,
        *,
        client: Any | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        fallbacks: bool = True,
    ):
        self.provider = getattr(settings, "llm_provider", "anthropic")
        self.model = settings.anthropic_model
        self.max_tokens = max_tokens
        self.fallbacks = fallbacks
        self.last_served_model: str | None = None  # may differ from self.model after a fallback
        if self.provider == "bedrock":
            # Claude in Amazon Bedrock (Mantle): same Messages API, `anthropic.`-prefixed model ids,
            # bearer API key via the standard client + base_url. Server-side fallbacks are not supported.
            if not self.model.startswith("anthropic."):
                self.model = "anthropic." + self.model
            self.fallbacks = False
            if client is None:
                key = settings.bedrock_api_key
                if key is None:
                    raise LLMRequestError("BEDROCK_API_KEY is not configured", status_code=None)
                client = anthropic.Anthropic(
                    api_key=key.get_secret_value(),
                    base_url=f"https://bedrock-mantle.{settings.bedrock_region}.api.aws/anthropic",
                )
        elif client is None:
            key = getattr(settings, "anthropic_api_key", None)
            client = anthropic.Anthropic(api_key=key.get_secret_value()) if key else anthropic.Anthropic()
        self._client = client

    def request_kwargs(self, *, system: str, user: str, schema: type[BaseModel], effort: str) -> dict:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": user}],
            "output_format": schema,
            "output_config": {"effort": effort},
        }
        if self.fallbacks:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
        return kwargs

    def parse(self, *, system: str, user: str, schema: type[T], effort: str) -> T:
        _check_effort(effort)
        kwargs = self.request_kwargs(system=system, user=user, schema=schema, effort=effort)
        try:
            response = self._client.beta.messages.parse(**kwargs)
        except pydantic.ValidationError as e:
            # The SDK validates the JSON inside the call, before we can see stop_reason.
            if _is_truncated_json(e):
                raise LLMTruncatedError(f"{schema.__name__}: output JSON ended early (max_tokens?)") from e
            raise LLMOutputError(f"{schema.__name__}: output did not match schema") from e
        except anthropic.RateLimitError as e:
            raise LLMRateLimitError("rate limited after retries") from e
        except anthropic.APIConnectionError as e:  # includes APITimeoutError
            raise LLMUnavailableError(f"connection failed: {type(e).__name__}") from e
        except anthropic.APIStatusError as e:
            if e.status_code >= 500 or e.status_code in (408, 409):
                raise LLMUnavailableError(f"API unavailable ({e.status_code})") from e
            raise LLMRequestError(f"API rejected request ({e.status_code})", status_code=e.status_code) from e
        except anthropic.AnthropicError as e:
            raise LLMError(f"anthropic SDK error: {type(e).__name__}") from e

        return self._read(response, schema)

    def _read(self, response: Any, schema: type[T]) -> T:
        stop = getattr(response, "stop_reason", None)
        self.last_served_model = getattr(response, "model", None)
        usage = getattr(response, "usage", None)
        log.info(
            "llm %s schema=%s stop=%s served_by=%s cache_read=%s cache_write=%s request_id=%s",
            self.model, schema.__name__, stop, self.last_served_model,
            getattr(usage, "cache_read_input_tokens", None),
            getattr(usage, "cache_creation_input_tokens", None),
            getattr(response, "_request_id", None),
        )
        if stop == "refusal":
            details = getattr(response, "stop_details", None)
            raise LLMRefusalError(
                f"{schema.__name__}: model refused",
                category=getattr(details, "category", None),
                explanation=getattr(details, "explanation", None),
            )
        if stop in ("max_tokens", "model_context_window_exceeded"):
            raise LLMTruncatedError(f"{schema.__name__}: output truncated ({stop})")
        if stop not in ("end_turn", "stop_sequence"):
            raise LLMOutputError(f"{schema.__name__}: unexpected stop_reason {stop!r}")
        parsed = getattr(response, "parsed_output", None)
        if parsed is None:
            raise LLMOutputError(f"{schema.__name__}: no structured output in response")
        if not isinstance(parsed, schema):
            raise LLMOutputError(f"{schema.__name__}: parsed output has type {type(parsed).__name__}")
        return parsed


# ---------- test backend ----------

@dataclass(frozen=True)
class LLMCall:
    system: str
    user: str
    schema: type[BaseModel]
    effort: str


class FakeLLM:
    """Scripted LLM for offline tests. Each `parse` pops the next scripted item:
    a schema instance (returned), a dict (validated into the schema), or an Exception (raised).
    Every call is recorded in `.calls`."""

    model = "fake-llm"

    def __init__(self, responses: Iterable[BaseModel | dict | Exception] = ()):
        self.responses: deque[BaseModel | dict | Exception] = deque(responses)
        self.calls: list[LLMCall] = []

    def push(self, *items: BaseModel | dict | Exception) -> None:
        self.responses.extend(items)

    def parse(self, *, system: str, user: str, schema: type[T], effort: str) -> T:
        _check_effort(effort)
        self.calls.append(LLMCall(system=system, user=user, schema=schema, effort=effort))
        if not self.responses:
            raise AssertionError(f"FakeLLM: no scripted response left for {schema.__name__}")
        item = self.responses.popleft()
        if isinstance(item, Exception):
            raise item
        if isinstance(item, dict):
            return schema.model_validate(item)
        if not isinstance(item, schema):
            raise TypeError(f"FakeLLM: scripted {type(item).__name__}, but call asked for {schema.__name__}")
        return item
