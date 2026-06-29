"""Stage 3 — extractive ranking. TF-IDF cosine graph + TextRank (pagerank).

The selected sentences are the ANCHORS: each carries real page+bbox geometry,
so any summary point derived from one is guaranteed verifiable.
"""
from dataclasses import dataclass

import networkx as nx
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .segment import Sentence


@dataclass(frozen=True)
class RankedSentence:
    sentence: Sentence
    confidence: float   # 0..1 normalized score


def rank(sentences: list[Sentence], top_n: int) -> list[RankedSentence]:
    if not sentences:
        return []
    if len(sentences) == 1:
        return [RankedSentence(sentence=sentences[0], confidence=1.0)]

    texts = [s.text for s in sentences]
    vec = TfidfVectorizer(stop_words="english", min_df=1)
    tfidf = vec.fit_transform(texts)
    sim = cosine_similarity(tfidf)

    g = nx.from_numpy_array(sim)
    try:
        pr = nx.pagerank(g, max_iter=200)
    except nx.PowerIterationFailedConvergence:
        pr = {i: float(sim[i].sum()) for i in range(len(sentences))}

    scores = [pr.get(i, 0.0) for i in range(len(sentences))]
    lo, hi = min(scores), max(scores)
    rng = (hi - lo) or 1.0
    norm = [(s - lo) / rng for s in scores]

    order = sorted(range(len(sentences)), key=lambda i: norm[i], reverse=True)
    chosen = order[: max(0, top_n)]
    return [RankedSentence(sentence=sentences[i], confidence=round(norm[i], 4)) for i in chosen]
