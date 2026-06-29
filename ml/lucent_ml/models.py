"""Frozen API contract (PRD §6)."""
from pydantic import BaseModel, Field


class PageDim(BaseModel):
    page: int
    width: float
    height: float


class SummaryPoint(BaseModel):
    id: str
    text: str
    anchorSentence: str
    page: int
    bboxes: list[list[float]]          # each [x0, y0, x1, y1] in PDF point space
    confidence: float = Field(ge=0.0, le=1.0)
    themeId: str


class Theme(BaseModel):
    id: str
    label: str
    pointIds: list[str]


class SummarizeResponse(BaseModel):
    docId: str
    filename: str
    pageCount: int
    pages: list[PageDim]
    points: list[SummaryPoint]
    themes: list[Theme]
    timings: dict[str, int]


class ErrorResponse(BaseModel):
    error: str
    message: str
