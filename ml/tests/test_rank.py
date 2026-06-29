from lucent_ml.pipeline.parse import parse_pdf
from lucent_ml.pipeline.segment import segment
from lucent_ml.pipeline.rank import rank, RankedSentence


def test_rank_selects_top_n_with_normalized_scores(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    ranked = rank(sentences, top_n=4)
    assert len(ranked) == 4
    assert all(isinstance(r, RankedSentence) for r in ranked)
    assert all(0.0 <= r.confidence <= 1.0 for r in ranked)
    # ranked are a subset of the input sentences (anchors are REAL sentences)
    src_texts = {s.text for s in sentences}
    assert all(r.sentence.text in src_texts for r in ranked)
    # highest score first
    scores = [r.confidence for r in ranked]
    assert scores == sorted(scores, reverse=True)


def test_rank_top_n_larger_than_corpus_returns_all(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    ranked = rank(sentences, top_n=999)
    assert len(ranked) == len(sentences)


def test_rank_empty_returns_empty():
    assert rank([], top_n=5) == []
