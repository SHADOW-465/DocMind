"""API-backed reword provider (OpenAI-compatible chat completions).

Lets the reword stage call hosted LLMs instead of the local transformers model —
useful for testing without downloading model weights. Tries each configured
backend in order (NVIDIA NIM first, then Groq) and returns the first success.
Backends without an API key are skipped. If every backend fails, `reword` raises;
the pipeline's `reword_anchors` then falls back to the verbatim anchor sentence,
so citations stay correct regardless.
"""
from dataclasses import dataclass

import httpx

from ..settings import settings

# Keep the model tightly constrained: one plain-language sentence, no preamble.
_SYSTEM_PROMPT = (
    "Rewrite the user's sentence as a single concise, plain-language sentence that "
    "preserves its meaning. Output only the rewritten sentence, with no preamble, "
    "quotes, or explanation."
)


@dataclass(frozen=True)
class ChatBackend:
    name: str
    base_url: str          # e.g. https://integrate.api.nvidia.com/v1
    api_key: str
    model: str


class ApiRewordProvider:
    """Reword via OpenAI-compatible chat completions with ordered fallback."""

    def __init__(self, backends: list[ChatBackend], *, timeout: float = 30.0, transport=None):
        # Only keep backends that actually have a key configured.
        self._backends = [b for b in backends if b.api_key]
        self._timeout = timeout
        self._transport = transport  # injectable for tests (httpx.MockTransport)

    @property
    def configured_backends(self) -> list[str]:
        return [b.name for b in self._backends]

    def reword(self, sentence: str) -> str:
        if not self._backends:
            raise RuntimeError(
                "no API reword backend configured — set NVIDIA_API_KEY and/or GROQ_API_KEY"
            )
        errors: list[str] = []
        for backend in self._backends:
            try:
                text = self._call(backend, sentence)
                if text:
                    return text
                errors.append(f"{backend.name}: empty response")
            except Exception as e:  # noqa: BLE001 - record and try the next backend
                errors.append(f"{backend.name}: {e}")
        raise RuntimeError("all reword backends failed: " + "; ".join(errors))

    def _call(self, backend: ChatBackend, sentence: str) -> str:
        payload = {
            "model": backend.model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": sentence},
            ],
            "temperature": 0,        # deterministic for reproducibility
            "max_tokens": 80,
        }
        headers = {
            "Authorization": f"Bearer {backend.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{backend.base_url.rstrip('/')}/chat/completions"
        with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
            r = client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        return data["choices"][0]["message"]["content"].strip()


def default_api_provider(transport=None) -> ApiRewordProvider:
    """Build the default NIM-primary, Groq-fallback provider from settings."""
    backends = [
        ChatBackend("nvidia-nim", settings.NIM_BASE_URL, settings.NVIDIA_API_KEY, settings.NIM_MODEL),
        ChatBackend("groq", settings.GROQ_BASE_URL, settings.GROQ_API_KEY, settings.GROQ_MODEL),
    ]
    return ApiRewordProvider(backends, timeout=settings.API_TIMEOUT_S, transport=transport)
