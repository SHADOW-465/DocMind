"""Stage 6 — assemble final response. This file starts with the bbox merge
helper; the response builder is wired in the /summarize task."""

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
