from lucent_ml.models import SummarizeResponse, SummaryPoint, Theme, PageDim


def test_response_roundtrips_contract_shape():
    resp = SummarizeResponse(
        docId="d1", filename="a.pdf", pageCount=1,
        pages=[PageDim(page=1, width=612.0, height=792.0)],
        points=[SummaryPoint(id="p1", text="t", anchorSentence="s", page=1,
                             bboxes=[[1.0, 2.0, 3.0, 4.0]], confidence=0.5, themeId="t1")],
        themes=[Theme(id="t1", label="Summary", pointIds=["p1"])],
        timings={"totalMs": 10},
    )
    d = resp.model_dump()
    assert d["points"][0]["bboxes"] == [[1.0, 2.0, 3.0, 4.0]]
    assert d["points"][0]["themeId"] == "t1"
    assert d["themes"][0]["pointIds"] == ["p1"]


def test_confidence_bounds_enforced():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        SummaryPoint(id="p", text="t", anchorSentence="s", page=1, bboxes=[], confidence=1.5, themeId="t1")
