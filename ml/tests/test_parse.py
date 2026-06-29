from lucent_ml.pipeline.parse import parse_pdf, Word


def test_parse_returns_pages_and_words(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    assert len(pages) == 2
    assert pages[0].page == 1
    assert pages[0].width > 0 and pages[0].height > 0
    # every word has geometry on a valid page
    assert all(isinstance(w, Word) for w in words)
    assert any(w.text.lower() == "photosynthesis" for w in words)
    assert all(w.page in (1, 2) for w in words)
    for w in words:
        x0, y0, x1, y1 = w.bbox
        assert x0 < x1 and y0 < y1


def test_parse_words_carry_correct_page(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    p2 = [w for w in words if w.page == 2]
    assert any("glycolysis" in w.text.lower() for w in p2)
    assert not any("photosynthesis" in w.text.lower() for w in p2)


def test_parse_rejects_non_pdf():
    import pytest
    from lucent_ml.pipeline.parse import ParseError
    with pytest.raises(ParseError):
        parse_pdf(b"this is not a pdf")
