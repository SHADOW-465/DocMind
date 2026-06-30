"""Tests for the API reword provider — no real network calls.

We inject an httpx.MockTransport so the real request-building / response-parsing
path is exercised, but every HTTP call is served by a local handler.
"""
import httpx
import pytest

from lucent_ml.providers.api_provider import ApiRewordProvider, ChatBackend
from lucent_ml.pipeline.reword import reword_anchors
from lucent_ml.pipeline.rank import RankedSentence
from lucent_ml.pipeline.segment import Sentence


NIM = ChatBackend("nvidia-nim", "https://nim.example/v1", "nim-key", "meta/llama-3.1-8b-instruct")
GROQ = ChatBackend("groq", "https://groq.example/openai/v1", "groq-key", "llama-3.1-8b-instant")


def _ok(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_primary_backend_success_returns_text():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "nim.example"  # primary is tried first
        body = request.read().decode()
        assert "meta/llama-3.1-8b-instruct" in body
        assert request.headers["Authorization"] == "Bearer nim-key"
        return _ok("  Plants make food from light.  ")

    provider = ApiRewordProvider([NIM, GROQ], transport=httpx.MockTransport(handler))
    assert provider.reword("Photosynthesis converts light into chemical energy.") == "Plants make food from light."


def test_falls_back_to_groq_when_primary_fails():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        if request.url.host == "nim.example":
            return httpx.Response(500, json={"error": "nim down"})
        return _ok("Groq rewrote this.")

    provider = ApiRewordProvider([NIM, GROQ], transport=httpx.MockTransport(handler))
    assert provider.reword("Some sentence.") == "Groq rewrote this."
    assert seen == ["nim.example", "groq.example"]  # NIM tried first, then Groq


def test_raises_when_all_backends_fail():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "down"})

    provider = ApiRewordProvider([NIM, GROQ], transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError, match="all reword backends failed"):
        provider.reword("Some sentence.")


def test_skips_backends_without_keys():
    no_nim = ChatBackend("nvidia-nim", "https://nim.example/v1", "", "m")  # no key -> skipped
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "groq.example"  # only groq has a key
        return _ok("Only groq.")

    provider = ApiRewordProvider([no_nim, GROQ], transport=httpx.MockTransport(handler))
    assert provider.configured_backends == ["groq"]
    assert provider.reword("x") == "Only groq."


def test_raises_clearly_when_no_backend_configured():
    provider = ApiRewordProvider([ChatBackend("nim", "u", "", "m"), ChatBackend("groq", "u", "", "m")])
    with pytest.raises(RuntimeError, match="no API reword backend configured"):
        provider.reword("x")


def test_reword_anchors_falls_back_to_verbatim_when_api_fails():
    """End-to-end: if the API provider raises, the pipeline keeps the anchor verbatim
    (citation stays correct), proving the provider plugs into the existing fallback."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "down"})

    provider = ApiRewordProvider([NIM, GROQ], transport=httpx.MockTransport(handler))
    sent = Sentence(text="The anchor sentence.", page=1, char_start=0, char_end=20,
                    word_bboxes=[(0.0, 0.0, 1.0, 1.0)])
    ranked = [RankedSentence(sentence=sent, confidence=1.0)]
    points = reword_anchors(ranked, provider=provider)
    assert len(points) == 1
    assert points[0].text == "The anchor sentence."  # verbatim fallback
