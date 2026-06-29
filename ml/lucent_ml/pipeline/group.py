"""Stage 5 — group points into themes via KMeans over embeddings.

The embedder is injected so tests can pass a fake (no model download). The
default embedder lazily loads sentence-transformers."""
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

from ..settings import settings


@dataclass(frozen=True)
class ThemeAssignment:
    theme_of: list[int]            # theme index per input point
    labels: dict[int, str]         # theme index -> label


class STEmbedder:
    """Lazy sentence-transformers embedder."""
    def __init__(self, model: str | None = None):
        self._name = model or settings.EMBED_MODEL
        self._model = None

    def encode(self, texts):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._name)
        return np.asarray(self._model.encode(list(texts)))


def default_embedder() -> STEmbedder:
    return STEmbedder()


def _label_for(texts: list[str]) -> str:
    """Cheap label = top TF-IDF term(s) across the cluster's texts (no LLM)."""
    if not texts:
        return "Summary"
    try:
        vec = TfidfVectorizer(stop_words="english", min_df=1)
        m = vec.fit_transform(texts)
        scores = np.asarray(m.sum(axis=0)).ravel()
        terms = vec.get_feature_names_out()
        top = [terms[i] for i in scores.argsort()[::-1][:2]]
        return " / ".join(t.capitalize() for t in top) if top else "Summary"
    except ValueError:
        return "Summary"


def group_points(texts: list[str], embedder=None) -> ThemeAssignment:
    n = len(texts)
    if n == 0:
        return ThemeAssignment(theme_of=[], labels={})
    if n < 4:
        return ThemeAssignment(theme_of=[0] * n, labels={0: _label_for(texts)})

    embedder = embedder or default_embedder()
    X = embedder.encode(texts)
    k = max(2, min(5, round(n / 3)))
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    assign = km.fit_predict(X).tolist()

    labels: dict[int, str] = {}
    for t_idx in sorted(set(assign)):
        members = [texts[i] for i in range(n) if assign[i] == t_idx]
        labels[t_idx] = _label_for(members)
    return ThemeAssignment(theme_of=assign, labels=labels)
