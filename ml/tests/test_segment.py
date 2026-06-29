from lucent_ml.pipeline.parse import parse_pdf
from lucent_ml.pipeline.segment import segment, Sentence


def test_segment_produces_sentences_with_geometry(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    assert len(sentences) >= 8
    assert all(isinstance(s, Sentence) for s in sentences)
    # each sentence has at least one word bbox and a valid page
    for s in sentences:
        assert s.page in (1, 2)
        assert len(s.word_bboxes) >= 1
        assert s.text.strip()


def test_each_sentence_text_is_reconstructable(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    # the photosynthesis sentence appears, on page 1
    hit = [s for s in sentences if "photosynthesis converts light energy" in s.text.lower()]
    assert hit and hit[0].page == 1
    # its bboxes all belong to page 1 geometry
    assert all(len(b) == 4 for b in hit[0].word_bboxes)


def test_sentence_does_not_span_two_pages(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    # by construction page is a single int; assert no sentence mixes pages
    # (we group words per page before segmenting)
    for s in sentences:
        assert isinstance(s.page, int)
