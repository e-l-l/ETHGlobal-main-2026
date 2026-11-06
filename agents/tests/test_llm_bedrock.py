"""Offline tests for the Bedrock Converse backend (stub client; no AWS calls)."""

import pytest
from pydantic import SecretStr

from mra_agents.config import Settings
from mra_agents.llm import LLMOutputError, LLMRateLimitError, LLMTruncatedError
from mra_agents.llm_bedrock import BedrockConverseLLM, inline_refs, make_llm
from mra_agents.models import CriticVerdict, OfferDraft


def settings(**kw):
    return Settings(_env_file=None, llm_provider="bedrock-converse", bedrock_api_key=SecretStr("x" * 40), **kw)


class Stub:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def converse(self, **kw):
        self.calls.append(kw)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def tool_resp(inp, stop="tool_use"):
    return {"stopReason": stop, "output": {"message": {"content": [
        {"toolUse": {"toolUseId": "t1", "name": "submit", "input": inp}}]}}}


VERDICT = {"verdict": "reject", "flags": [{"code": "circular_funding", "severity": "block",
                                           "evidence": "funded_by_shop_share=0.9"}],
           "summary_en": "Wash trading.", "summary_es": "Lavado."}


def test_inline_refs_removes_defs():
    s = inline_refs(CriticVerdict.model_json_schema())
    assert "$defs" not in s and "$ref" not in str(s)
    assert s["properties"]["flags"]["items"]["properties"]["severity"]["enum"] == ["info", "warn", "block"]


def test_routes_model_by_schema_and_forces_tool():
    stub = Stub(tool_resp(VERDICT))
    llm = BedrockConverseLLM(settings(), client=stub)
    out = llm.parse(system="sys", user="u", schema=CriticVerdict, effort="high")
    assert out.verdict == "reject"
    call = stub.calls[0]
    assert call["modelId"] == "moonshotai.kimi-k2.5"
    assert call["toolConfig"]["toolChoice"] == {"tool": {"name": "submit"}}
    assert call["system"] == [{"text": "sys"}]
    assert llm.last_served_model == "moonshotai.kimi-k2.5"
    assert llm.model_for(OfferDraft) == "mistral.mistral-large-3-675b-instruct"


def test_one_repair_round_then_success():
    bad = dict(VERDICT, verdict="maybe")
    stub = Stub(tool_resp(bad), tool_resp(VERDICT))
    out = BedrockConverseLLM(settings(), client=stub).parse(system="s", user="u", schema=CriticVerdict, effort="high")
    assert out.verdict == "reject" and len(stub.calls) == 2
    second = stub.calls[1]["messages"]
    assert second[-1]["content"][0]["toolResult"]["status"] == "error"


def test_two_invalid_outputs_raise():
    bad = dict(VERDICT, verdict="maybe")
    with pytest.raises(LLMOutputError):
        BedrockConverseLLM(settings(), client=Stub(tool_resp(bad), tool_resp(bad))).parse(
            system="s", user="u", schema=CriticVerdict, effort="high")


def test_no_tool_call_and_truncation():
    no_tool = {"stopReason": "end_turn", "output": {"message": {"content": [{"text": "hi"}]}}}
    with pytest.raises(LLMOutputError):
        BedrockConverseLLM(settings(), client=Stub(no_tool)).parse(system="s", user="u", schema=CriticVerdict,
                                                                   effort="low")
    trunc = {"stopReason": "max_tokens", "output": {"message": {"content": [{"text": "thinking..."}]}}}
    with pytest.raises(LLMTruncatedError):
        BedrockConverseLLM(settings(), client=Stub(trunc)).parse(system="s", user="u", schema=CriticVerdict,
                                                                 effort="low")


def test_throttling_maps_to_rate_limit():
    from botocore.exceptions import ClientError
    err = ClientError({"Error": {"Code": "ThrottlingException"}, "ResponseMetadata": {"HTTPStatusCode": 429}},
                      "Converse")
    with pytest.raises(LLMRateLimitError):
        BedrockConverseLLM(settings(), client=Stub(err)).parse(system="s", user="u", schema=CriticVerdict,
                                                               effort="low")


def test_make_llm_selects_backend_and_key_not_leaked():
    s = settings()
    assert isinstance(make_llm(s), BedrockConverseLLM)
    assert "x" * 40 not in repr(s)
