"""Stage 1 — parse a PDF into pages + geometry-bearing words (PyMuPDF)."""
from dataclasses import dataclass
import fitz  # PyMuPDF


class ParseError(Exception):
    pass


@dataclass(frozen=True)
class PageInfo:
    page: int          # 1-based
    width: float
    height: float


@dataclass(frozen=True)
class Word:
    text: str
    bbox: tuple[float, float, float, float]   # x0, y0, x1, y1 (PDF point space)
    page: int          # 1-based
    block: int
    line: int
    word_no: int


def parse_pdf(data: bytes) -> tuple[list[PageInfo], list[Word]]:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise ParseError(f"could not open PDF: {e}") from e

    if doc.is_encrypted:
        raise ParseError("password-protected")

    pages: list[PageInfo] = []
    words: list[Word] = []
    for i, page in enumerate(doc):
        rect = page.rect
        pages.append(PageInfo(page=i + 1, width=float(rect.width), height=float(rect.height)))
        for w in page.get_text("words"):
            x0, y0, x1, y1, text, block, line, word_no = w
            if not text.strip():
                continue
            words.append(Word(
                text=text, bbox=(float(x0), float(y0), float(x1), float(y1)),
                page=i + 1, block=int(block), line=int(line), word_no=int(word_no),
            ))

    if not words:
        raise ParseError("no extractable text — this looks like a scanned PDF (OCR not supported in v1)")
    return pages, words
