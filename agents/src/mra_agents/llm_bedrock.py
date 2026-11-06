"""Bedrock Converse backend for the `LLM` protocol (non-Claude models on Amazon Bedrock).

Used when the AWS account cannot access Anthropic models. Structured output is done with one
forced tool call whose input schema is the Pydantic schema; the result is validated with Pydantic and
retried once with the validation error as feedback.

Different model families per role (routed by output schema) make the Critic independent of the
Underwriter by construction, not just by prompt.

Auth: Bedrock API key (bearer) from settings.bedrock_api_key, exported to boto3 as
AWS_BEARER_TOKEN_BEDROCK for this process only. Never logged.
"""

from __future__ import annotations

import copy
import json
import logging
import os
from typing import Any

import pydantic
from pydantic import BaseModel

from .config import Settings
from .interfaces import T
from .llm import (
    LLMError,
    LLMOutputError,
    LLMRateLimitError,
    LLMRequestError,
    LLMTruncatedError,
    LLMUnavailableError,
    _check_effort,
)

log = logging.getLogger(__name__)

TOOL_NAME = "submit"
# effort -> max output tokens (reasoning models think inside this budget)
EFFORT_MAX_TOKENS = {"low": 2_000, "medium": 4_000, "high": 8_000, "xhigh": 8_000, "max": 8_000}


def inline_refs(schema: dict) -> dict:
    """Converse tool schemas may not resolve $ref/$defs; inline them (no recursion in our models)."""
    schema = copy.deepcopy(schema)
    defs = schema.pop("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].rsplit("/", 1)[-1]
                return walk(copy.deepcopy(defs[name]))
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


class BedrockConverseLLM:
    """`LLM` implementation over Bedrock's Converse API with per-schema model routing."""

    def __init__(self, settings: Settings, *, client: Any | None = None):
        self.settings = settings
        self.models: dict[str, str] = {
            "OfferDraft": settings.bedrock_underwriter_model,
            "CriticVerdict": settings.bedrock_critic_model,
            "RiskProposal": settings.bedrock_risk_model,
        }
        self.model = settings.bedrock_underwriter_model
        self.last_served_model: str | None = None
        if client is None:
            if settings.bedrock_api_key is None:
                raise LLMRequestError("BEDROCK_API_KEY is not configured")
            os.environ["AWS_BEARER_TOKEN_BEDROCK"] = settings.bedrock_api_key.get_secret_value()
            import boto3
            from botocore.config import Config

            client = boto3.client("bedrock-runtime", region_name=settings.bedrock_region,
                                  config=Config(read_timeout=120, retries={"max_attempts": 3, "mode": "standard"}))
        self._client = client

    def model_for(self, schema: type[BaseModel]) -> str:
        return self.models.get(schema.__name__, self.settings.bedrock_underwriter_model)

    def parse(self, *, system: str, user: str, schema: type[T], effort: str) -> T:
        _check_effort(effort)
        model = self.model_for(schema)
        tool = {"toolSpec": {"name": TOOL_NAME,
                             "description": f"Submit the final {schema.__name__}. Call exactly once.",
                             "inputSchema": {"json": inline_refs(schema.model_json_schema())}}}
        messages: list[dict] = [{"role": "user", "content": [{"text": user}]}]
        last_err: Exception | None = None
        for attempt in range(2):
            resp = self._converse(model, system, messages, tool, EFFORT_MAX_TOKENS[effort])
            self.last_served_model = model
            stop = resp.get("stopReason")
            content = resp["output"]["message"]["content"]
            tool_uses = [c["toolUse"] for c in content if "toolUse" in c]
            if not tool_uses:
                if stop == "max_tokens":
                    raise LLMTruncatedError(f"{model}: ran out of tokens before answering ({schema.__name__})")
                raise LLMOutputError(f"{model}: no {TOOL_NAME} call (stop={stop})")
            try:
                return schema.model_validate(tool_uses[0]["input"])
            except pydantic.ValidationError as e:
                last_err = e
                if attempt == 0:  # one repair round with the validation error as feedback
                    messages += [
                        {"role": "assistant", "content": [{"toolUse": tool_uses[0]}]},
                        {"role": "user", "content": [{"toolResult": {
                            "toolUseId": tool_uses[0]["toolUseId"], "status": "error",
                            "content": [{"text": "Invalid: " + json.dumps(e.errors(include_url=False,
                                                                                    include_input=False))[:2000]
                                         + f". Call {TOOL_NAME} again with a corrected input."}]}}]},
                    ]
        raise LLMOutputError(f"{model}: output did not match {schema.__name__}") from last_err

    def _converse(self, model: str, system: str, messages: list, tool: dict, max_tokens: int) -> dict:
        from botocore.exceptions import ClientError, EndpointConnectionError, ReadTimeoutError

        try:
            return self._client.converse(
                modelId=model,
                system=[{"text": system}],
                messages=messages,
                toolConfig={"tools": [tool], "toolChoice": {"tool": {"name": TOOL_NAME}}},
                inferenceConfig={"maxTokens": max_tokens},
            )
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code == "ThrottlingException":
                raise LLMRateLimitError(f"{model}: throttled") from e
            if code in ("ServiceUnavailableException", "InternalServerException", "ModelNotReadyException") or (
                    status and status >= 500):
                raise LLMUnavailableError(f"{model}: unavailable ({code})") from e
            raise LLMRequestError(f"{model}: rejected ({code})", status_code=status) from e
        except (EndpointConnectionError, ReadTimeoutError) as e:
            raise LLMUnavailableError(f"{model}: connection failed") from e


def make_llm(settings: Settings):
    """Pick the LLM backend from settings.llm_provider: anthropic | bedrock (Claude) | bedrock-converse."""
    if settings.llm_provider == "bedrock-converse":
        return BedrockConverseLLM(settings)
    from .llm import AnthropicLLM

    return AnthropicLLM(settings)


__all__ = ["BedrockConverseLLM", "LLMError", "inline_refs", "make_llm"]
