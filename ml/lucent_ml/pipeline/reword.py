"""Stage 4 — reword each ranked anchor into a plain-language point.

The citation stays bound to the anchor (its sentence + geometry), never to the
reworded text. If the provider fails for an anchor, fall back to the verbatim
sentence so the point is still correct."""
from dataclasses import dataclass

from .rank import RankedSentence


@dataclass(frozen=True)
class RewordedPoint:
    text: str                 # plain-language restatement (or verbatim on fallback)
    anchor: RankedSentence    # carries the real sentence + page + bboxes + confidence


def reword_anchors(ranked: list[RankedSentence], provider) -> list[RewordedPoint]:
    points: list[RewordedPoint] = []
    for r in ranked:
        try:
            text = provider.reword(r.sentence.text).strip() or r.sentence.text
        except Exception:
            text = r.sentence.text  # verbatim fallback — still a valid citation
        points.append(RewordedPoint(text=text, anchor=r))
    return points
