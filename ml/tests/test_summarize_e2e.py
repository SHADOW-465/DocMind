import io
import pytest
from fastapi.testclient import TestClient

from lucent_ml.app import app, get_reword_provider, get_embedder
from lucent_ml.pipeline.parse import parse_pdf


class FakeProvider:
    def reword(self, sentence: str) -> str:
        return "Plainly: " + sentence


class FakeEmbedder:
    def encode(self, texts):
        import numpy as np
        return np.array([[float(len(t) % 3 == 0), float(len(t) % 3 != 0)] for t in texts])


@pytest.fixture
def client():
    app.dependency_overrides[get_reword_provider] = lambda: FakeProvider()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_summarize_contract_and_integrity(client, sample_pdf_bytes):
    files = {"file": ("sample-2page.pdf", io.BytesIO(sample_pdf_bytes), "application/pdf")}
    r = client.post("/summarize", files=files, data={"length": "short", "group": "true"})
    assert r.status_code == 200
    body = r.json()

    # contract shape
    for key in ("docId", "filename", "pageCount", "pages", "points", "themes", "timings"):
        assert key in body
    assert body["pageCount"] == 2
    assert len(body["points"]) >= 1

    # INTEGRITY INVARIANT — reconstruct source text per page, then assert:
    pages, words = parse_pdf(sample_pdf_bytes)
    page_dims = {p.page: (p.width, p.height) for p in pages}
    # reconstructed page text (same join rule as segment._page_text_and_spans)
    page_text = {}
    for pg in (1, 2):
        page_text[pg] = " ".join(w.text for w in words if w.page == pg)

    for pt in body["points"]:
        # (a) anchorSentence is a substring of its page's reconstructed text
        assert pt["anchorSentence"] in page_text[pt["page"]], pt["anchorSentence"]
        # (b) every bbox lies within the page dimensions
        w, h = page_dims[pt["page"]]
        for (x0, y0, x1, y1) in pt["bboxes"]:
            assert 0 <= x0 <= x1 <= w + 1
            assert 0 <= y0 <= y1 <= h + 1
        # (c) a point always has a real anchor (no anchor = no point)
        assert pt["anchorSentence"].strip()


def test_summarize_rejects_non_pdf(client):
    files = {"file": ("x.txt", io.BytesIO(b"not a pdf"), "application/pdf")}
    r = client.post("/summarize", files=files)
    assert r.status_code == 422
    assert r.json()["error"]


def test_summarize_internal_error_returns_500(sample_pdf_bytes):
    from lucent_ml.app import app as _app, get_reword_provider, get_embedder

    class RaisingEmbedder:
        def encode(self, texts):
            raise RuntimeError("boom")

    _app.dependency_overrides[get_reword_provider] = lambda: FakeProvider()
    _app.dependency_overrides[get_embedder] = lambda: RaisingEmbedder()
    try:
        c = TestClient(_app, raise_server_exceptions=False)
        files = {"file": ("sample-2page.pdf", io.BytesIO(sample_pdf_bytes), "application/pdf")}
        r = c.post("/summarize", files=files, data={"length": "detailed", "group": "true"})
        assert r.status_code == 500
        assert r.json()["error"] == "internal"
    finally:
        _app.dependency_overrides.clear()


@pytest.mark.slow
def test_summarize_with_real_models(sample_pdf_bytes):
    # No overrides → real transformers + sentence-transformers (downloads on first run).
    client = TestClient(app)
    files = {"file": ("sample-2page.pdf", io.BytesIO(sample_pdf_bytes), "application/pdf")}
    r = client.post("/summarize", files=files, data={"length": "short"})
    assert r.status_code == 200
    assert len(r.json()["points"]) >= 1
