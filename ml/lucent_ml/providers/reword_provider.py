"""Reword providers. Default uses a small transformers summarizer; the model is
loaded lazily so importing this module never triggers a download."""
from typing import Protocol

from ..settings import settings


class RewordProvider(Protocol):
    def reword(self, sentence: str) -> str: ...


class TransformersProvider:
    """Lazy-loads a distilbart summarizer on first use."""
    def __init__(self, model: str | None = None):
        self._model_name = model or settings.REWORD_MODEL
        self._pipe = None

    def _ensure(self):
        if self._pipe is None:
            from transformers import pipeline  # local import = no import-time download
            self._pipe = pipeline("summarization", model=self._model_name)

    def reword(self, sentence: str) -> str:
        self._ensure()
        # Ask for a short plain restatement of a single sentence.
        out = self._pipe(sentence, max_length=40, min_length=8, do_sample=False)
        return out[0]["summary_text"].strip()


def default_provider() -> RewordProvider:
    if settings.REWORD_PROVIDER in ("api", "nim", "groq", "openai-compatible"):
        # Hosted LLMs (NVIDIA NIM primary, Groq fallback) — no local model load.
        from .api_provider import default_api_provider
        return default_api_provider()
    # Default: local transformers summarizer.
    return TransformersProvider()
