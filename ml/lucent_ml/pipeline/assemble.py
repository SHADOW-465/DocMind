"""Stage 6 — assemble final response. This file starts with the bbox merge
helper; the response builder is wired in the /summarize task."""
import uuid

from .reword import RewordedPoint
from .group import ThemeAssignment, group_points
from ..models import SummarizeResponse, SummaryPoint, Theme, PageDim
from .parse import PageInfo

Bbox = tuple[float, float, float, float]


def merge_line_bboxes(boxes: list[Bbox], y_tol: float = 4.0) -> list[Bbox]:
    """Union word boxes that sit on the same text line into one rectangle.

    Two boxes are on the same line if their vertical centers are within y_tol.
    Produces clean line-level highlight rectangles for the overlay.
    """
    if not boxes:
        return []
    # sort top-to-bottom (PDF y grows downward in fitz word coords), then left-to-right
    ordered = sorted(boxes, key=lambda b: (round((b[1] + b[3]) / 2, 1), b[0]))
    lines: list[list[Bbox]] = []
    for b in ordered:
        cy = (b[1] + b[3]) / 2
        placed = False
        for line in lines:
            lcy = (line[0][1] + line[0][3]) / 2
            if abs(cy - lcy) <= y_tol:
                line.append(b)
                placed = True
                break
        if not placed:
            lines.append([b])

    merged: list[Bbox] = []
    for line in lines:
        x0 = min(b[0] for b in line)
        y0 = min(b[1] for b in line)
        x1 = max(b[2] for b in line)
        y1 = max(b[3] for b in line)
        merged.append((x0, y0, x1, y1))
    return merged


def build_response(
    *, filename: str, pages: list[PageInfo], points: list[RewordedPoint],
    timings: dict[str, int], embedder=None,
) -> SummarizeResponse:
    theme_assign: ThemeAssignment = group_points([p.text for p in points], embedder=embedder)

    out_points: list[SummaryPoint] = []
    theme_point_ids: dict[int, list[str]] = {}
    for i, p in enumerate(points):
        pid = f"p{i + 1}"
        t_idx = theme_assign.theme_of[i] if i < len(theme_assign.theme_of) else 0
        tid = f"t{t_idx + 1}"
        merged = merge_line_bboxes([tuple(b) for b in p.anchor.sentence.word_bboxes])
        out_points.append(SummaryPoint(
            id=pid, text=p.text, anchorSentence=p.anchor.sentence.text,
            page=p.anchor.sentence.page, bboxes=[list(b) for b in merged],
            confidence=p.anchor.confidence, themeId=tid,
        ))
        theme_point_ids.setdefault(t_idx, []).append(pid)

    themes = [
        Theme(id=f"t{t_idx + 1}", label=theme_assign.labels.get(t_idx, "Summary"), pointIds=pids)
        for t_idx, pids in sorted(theme_point_ids.items())
    ]
    return SummarizeResponse(
        docId=str(uuid.uuid4()), filename=filename, pageCount=len(pages),
        pages=[PageDim(page=pg.page, width=pg.width, height=pg.height) for pg in pages],
        points=out_points, themes=themes, timings=timings,
    )
