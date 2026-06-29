from lucent_ml.pipeline.parse import parse_pdf
from lucent_ml.pipeline.segment import segment
from lucent_ml.pipeline.rank import rank
from lucent_ml.pipeline.reword import reword_anchors


class FakeProvider:
    def reword(self, sentence: str) -> str:
        return "In simple terms: " + sentence.split(".")[0]


def test_reword_produces_one_point_per_anchor(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    ranked = rank(segment(words), top_n=4)
    points = reword_anchors(ranked, provider=FakeProvider())
    assert len(points) == len(ranked)
    for rp in points:
        assert rp.text.startswith("In simple terms:")
        # citation stays bound to the REAL anchor sentence + geometry
        assert rp.anchor.sentence.text
        assert rp.anchor.sentence.word_bboxes


def test_reword_falls_back_to_verbatim_on_provider_error(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    ranked = rank(segment(words), top_n=3)

    class BrokenProvider:
        def reword(self, sentence: str) -> str:
            raise RuntimeError("model unavailable")

    points = reword_anchors(ranked, provider=BrokenProvider())
    assert len(points) == 3
    # fallback: text equals the anchor sentence verbatim
    assert all(p.text == p.anchor.sentence.text for p in points)
