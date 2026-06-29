"""Stage 2 — group words into sentences that carry page + bbox geometry.

We reconstruct text per page from the ordered word list, run syntok sentence
segmentation, then map each sentence's character span back to the words it
covers so every sentence keeps real geometry. Sentences never span pages
because we segment one page at a time.
"""
from dataclasses import dataclass
from syntok.segmenter import process as syntok_process

from .parse import Word


@dataclass(frozen=True)
class Sentence:
    text: str
    page: int
    char_start: int                                   # offset within the page's reconstructed text
    char_end: int
    word_bboxes: list[tuple[float, float, float, float]]


def _page_text_and_spans(words: list[Word]) -> tuple[str, list[tuple[int, int, Word]]]:
    """Join words with single spaces; record each word's [start,end) char span."""
    parts: list[str] = []
    spans: list[tuple[int, int, Word]] = []
    cursor = 0
    for w in words:
        if parts:
            cursor += 1  # the space separator
        start = cursor
        parts.append(w.text)
        cursor += len(w.text)
        spans.append((start, cursor, w))
    return (" ".join(parts), spans)


def segment(words: list[Word]) -> list[Sentence]:
    sentences: list[Sentence] = []
    pages = sorted({w.page for w in words})
    for page in pages:
        page_words = [w for w in words if w.page == page]
        text, spans = _page_text_and_spans(page_words)

        # syntok gives token-level offsets; we use its sentence grouping and
        # re-locate each sentence in `text` via running search to get char spans.
        search_from = 0
        for paragraph in syntok_process(text):
            for sent in paragraph:
                raw = "".join(t.spacing + t.value for t in sent).strip()
                if not raw:
                    continue
                idx = text.find(raw, search_from)
                if idx == -1:
                    idx = text.find(raw)
                if idx == -1:
                    continue
                start, end = idx, idx + len(raw)
                search_from = end
                bboxes = [w.bbox for (s0, s1, w) in spans if s0 < end and s1 > start]
                if not bboxes:
                    continue
                sentences.append(Sentence(
                    text=raw, page=page, char_start=start, char_end=end, word_bboxes=bboxes,
                ))
    return sentences
