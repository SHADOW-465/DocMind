# Lucent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lucent — a 2-tier PDF summarizer where every plain-language summary point is beam-linked to the exact source region on the rendered PDF it was derived from.

**Architecture:** Python FastAPI ML service (`ml/`) parses a PDF with PyMuPDF (text + word bounding boxes + page dims), segments to sentences carrying geometry, ranks them extractively (TF-IDF + TextRank) into anchors, rewords each anchor with a small transformers model, groups points into themes, and returns a frozen JSON contract. A Next.js/React frontend (`web/`) renders the PDF, lists summary cards, and draws SVG cubic-bezier beams from each point to its source region. The trust invariant — every point is born from a real anchor sentence whose geometry exists — is enforced by tests.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, pydantic, PyMuPDF (fitz), syntok, scikit-learn, networkx, sentence-transformers (`all-MiniLM-L6-v2`), transformers (`sshleifer/distilbart-cnn-12-6`), pytest. Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, react-pdf (pdf.js), Vitest + Testing Library.

**Source spec:** `docs/2026-06-29-lucent-prd.md` (read §5 pipeline, §6 API contract, §8 stack, §9 repo structure).

---

## File Structure

Locked from PRD §9. Files created across tasks:

```
lucent/
├── README.md                              T1
├── .gitignore                             T1
├── docker-compose.yml                     T1
├── ml/
│   ├── pyproject.toml                      T1
│   ├── lucent_ml/
│   │   ├── __init__.py                     T1
│   │   ├── settings.py                     T1
│   │   ├── models.py                       T4  (pydantic contract)
│   │   ├── app.py                          T2 (healthz) → T11 (/summarize)
│   │   ├── pipeline/
│   │   │   ├── __init__.py                 T5
│   │   │   ├── parse.py                     T5
│   │   │   ├── segment.py                   T6
│   │   │   ├── rank.py                      T7
│   │   │   ├── reword.py                    T9
│   │   │   ├── group.py                     T10
│   │   │   └── assemble.py                  T8 (bbox merge) + T11 (wiring)
│   │   └── providers/
│   │       └── reword_provider.py           T9
│   └── tests/
│       ├── conftest.py                      T5
│       ├── fixtures/sample-2page.pdf        T5 (generated, committed)
│       ├── test_parse.py                    T5
│       ├── test_segment.py                  T6
│       ├── test_rank.py                     T7
│       ├── test_assemble.py                 T8
│       ├── test_reword.py                   T9
│       ├── test_group.py                    T10
│       └── test_summarize_e2e.py            T11
└── web/
    ├── package.json / tsconfig / tailwind   T3
    ├── vitest.config.ts                     T3
    ├── app/{layout.tsx,page.tsx,globals.css} T3, T12
    ├── lib/
    │   ├── types.ts                          T12 (mirrors contract)
    │   ├── api.ts                            T12
    │   ├── geometry.ts                       T14 (PURE, unit-tested)
    │   └── useBeams.ts                       T15
    ├── components/
    │   ├── UploadZone.tsx                    T12
    │   ├── PdfCanvas.tsx                     T13
    │   ├── SummaryPanel.tsx                  T13
    │   ├── SummaryCard.tsx                   T13
    │   ├── ThemeGroup.tsx                    T16
    │   └── BeamOverlay.tsx                   T15
    └── __tests__/
        ├── geometry.test.ts                  T14
        ├── SummaryCard.test.tsx              T13
        └── BeamOverlay.test.tsx              T15
```

**Decomposition rationale:** Each pipeline stage is a pure function in its own file, testable in isolation against the committed fixture. The pydantic contract (`models.py`) lands before the stages that produce it. The frontend's pure geometry function is isolated in `lib/geometry.ts` so the bezier math is unit-tested without a DOM. Beam wiring (`useBeams.ts` + `BeamOverlay.tsx`) is separated from the pure path-string builder.

**Two test-isolation rules (apply throughout):**
- ML tests must NOT trigger real model downloads in unit tests. The reword + embedding models are injected/monkeypatched with fakes in unit tests. Exactly ONE e2e test (`test_summarize_e2e.py`) may load the real transformers model, marked `@pytest.mark.slow` so it can be deselected in CI (`pytest -m "not slow"`).
- Frontend tests mock `lib/api.ts`; `geometry.ts` is pure and tested directly.

---

## Task 1: Repo scaffold + git init

**Files:**
- Create: `lucent/.gitignore`, `lucent/README.md`, `lucent/docker-compose.yml`, `ml/pyproject.toml`, `ml/lucent_ml/__init__.py`, `ml/lucent_ml/settings.py`

- [ ] **Step 1: Initialize git (the repo currently has only `docs/`)**

```bash
cd C:/Users/acer/Documents/projects/lucent
git init
git add docs/
git commit -m "docs: add Lucent PRD + implementation plan"
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
venv/
*.egg-info/
.pytest_cache/
.ruff_cache/
# Node
node_modules/
.next/
out/
# Models / caches (downloaded at runtime)
ml/.hf_cache/
# Env
.env
.env.local
# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Write `ml/pyproject.toml`**

```toml
[project]
name = "lucent-ml"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "python-multipart>=0.0.12",
  "pydantic>=2.9",
  "PyMuPDF>=1.24",
  "syntok>=1.4.4",
  "scikit-learn>=1.5",
  "networkx>=3.3",
  "numpy>=1.26",
  "sentence-transformers>=3.0",
  "transformers>=4.44",
  "torch>=2.2",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "httpx>=0.27", "reportlab>=4.2"]

[tool.pytest.ini_options]
markers = ["slow: tests that load real ML models (deselect with -m 'not slow')"]
asyncio_mode = "auto"

[tool.setuptools.packages.find]
where = ["."]
include = ["lucent_ml*"]
```

- [ ] **Step 4: Write `ml/lucent_ml/__init__.py` (empty) and `ml/lucent_ml/settings.py`**

`ml/lucent_ml/__init__.py`: empty file.

`ml/lucent_ml/settings.py`:
```python
"""Runtime configuration via environment variables."""
import os


class Settings:
    MAX_UPLOAD_MB: int = int(os.environ.get("LUCENT_MAX_UPLOAD_MB", "25"))
    REWORD_PROVIDER: str = os.environ.get("LUCENT_REWORD_PROVIDER", "transformers")
    REWORD_MODEL: str = os.environ.get("LUCENT_REWORD_MODEL", "sshleifer/distilbart-cnn-12-6")
    EMBED_MODEL: str = os.environ.get("LUCENT_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    HF_HOME: str = os.environ.get("HF_HOME", os.path.join(os.path.dirname(__file__), "..", ".hf_cache"))
    # length preset -> target number of summary points
    LENGTH_TARGETS = {"short": 6, "medium": 10, "detailed": 16}


settings = Settings()
```

- [ ] **Step 5: Write `lucent/docker-compose.yml`**

```yaml
services:
  ml:
    build: ./ml
    ports: ["8000:8000"]
    environment:
      - HF_HOME=/app/.hf_cache
    volumes:
      - ./ml/.hf_cache:/app/.hf_cache
  web:
    build: ./web
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_ML_URL=http://localhost:8000
    depends_on: [ml]
```

(Dockerfiles are added in their respective tier tasks; compose is the orchestration target documented here. For local dev, running `uvicorn` and `next dev` directly is fine — see README.)

- [ ] **Step 6: Write `lucent/README.md`**

```markdown
# Lucent

Verifiable PDF summarization — every summary point links by a bezier beam to the
exact region of the source PDF it came from.

## Dev (two processes)

ML service:
    cd ml && python -m venv .venv && .venv/Scripts/activate  # (or source .venv/bin/activate)
    pip install -e ".[dev]"
    uvicorn lucent_ml.app:app --reload --port 8000

Web:
    cd web && npm install && npm run dev   # http://localhost:3000

First ML request downloads model weights (cached under ml/.hf_cache).

## Tests
    cd ml && pytest -m "not slow"     # fast unit tests (no model download)
    cd ml && pytest                   # includes the real-model e2e
    cd web && npm run test:run
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore README.md docker-compose.yml ml/pyproject.toml ml/lucent_ml/
git commit -m "chore: scaffold lucent repo (ml pyproject + settings, compose, readme)"
```

---

## Task 2: FastAPI app + /healthz

**Files:**
- Create: `ml/lucent_ml/app.py`
- Test: `ml/tests/test_healthz.py`, `ml/tests/conftest.py` (minimal, expanded in T5)

- [ ] **Step 1: Write the failing test `ml/tests/test_healthz.py`**

```python
from fastapi.testclient import TestClient
from lucent_ml.app import app

client = TestClient(app)


def test_healthz_ok():
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "modelsLoaded" in body
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pip install -e ".[dev]" && pytest tests/test_healthz.py -v
```
Expected: FAIL — `ModuleNotFoundError: lucent_ml.app` (or import error).

- [ ] **Step 3: Implement `ml/lucent_ml/app.py`**

```python
"""Lucent ML service — FastAPI app."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lucent ML", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models are lazily loaded on first /summarize call (see reword/group).
# modelsLoaded reflects whether the heavy pipeline import succeeded.
_MODELS_READY = True


@app.get("/healthz")
def healthz():
    return {"status": "ok", "modelsLoaded": _MODELS_READY}
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd ml && pytest tests/test_healthz.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/app.py ml/tests/test_healthz.py
git commit -m "feat(ml): add FastAPI app with /healthz"
```

---

## Task 3: Web scaffold (Next.js + Tailwind + Vitest) + healthz wired

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/vitest.config.ts`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/globals.css`, `web/lib/api.ts` (healthz only for now)
- Test: `web/__tests__/api.test.ts`

- [ ] **Step 1: Scaffold the Next.js app**

```bash
cd C:/Users/acer/Documents/projects/lucent/web
npm init -y
npm install next@16 react@19 react-dom@19
npm install -D typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/postcss vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Write config files**

`web/package.json` scripts block (merge into the generated file):
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017", "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true, "skipLibCheck": true, "strict": true, "noEmit": true,
    "esModuleInterop": true, "module": "esnext", "moduleResolution": "bundler",
    "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve",
    "incremental": true, "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

`web/postcss.config.mjs`:
```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"], passWithNoTests: true },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

`web/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom";
```

`web/app/globals.css`:
```css
@import "tailwindcss";

:root { --surface: #fafafa; --card: #ffffff; --ink: #1a1a1a; --muted: #6b7280; --accent: #4f46e5; }
body { background: var(--surface); color: var(--ink); }
```

`web/app/layout.tsx`:
```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Lucent", description: "Verifiable PDF summaries" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`web/app/page.tsx` (placeholder shell, replaced in T12):
```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-semibold">Lucent</h1>
    </main>
  );
}
```

- [ ] **Step 3: Write the failing test `web/__tests__/api.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkHealth } from "@/lib/api";

beforeEach(() => { vi.restoreAllMocks(); });

describe("checkHealth", () => {
  it("returns true when service reports ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: "ok", modelsLoaded: true }),
    }));
    expect(await checkHealth()).toBe(true);
  });

  it("returns false when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await checkHealth()).toBe(false);
  });
});
```

- [ ] **Step 4: Run, verify it fails**

```bash
cd web && npm run test:run -- __tests__/api.test.ts
```
Expected: FAIL — `@/lib/api` not found.

- [ ] **Step 5: Implement `web/lib/api.ts` (healthz only for now)**

```ts
const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? "http://localhost:8000";

export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${ML_URL}/healthz`);
    if (!r.ok) return false;
    const body = await r.json();
    return body.status === "ok";
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Run tests + build sanity**

```bash
cd web && npm run test:run -- __tests__/api.test.ts
npx tsc --noEmit
```
Expected: 2 passed; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "chore(web): scaffold Next.js + Tailwind + Vitest; add healthz api client"
```

---

## Task 4: Pydantic contract (`models.py`)

**Files:**
- Create: `ml/lucent_ml/models.py`
- Test: `ml/tests/test_models.py`

- [ ] **Step 1: Write the failing test `ml/tests/test_models.py`**

```python
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
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pytest tests/test_models.py -v
```
Expected: FAIL — `lucent_ml.models` not found.

- [ ] **Step 3: Implement `ml/lucent_ml/models.py`**

```python
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
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd ml && pytest tests/test_models.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/models.py ml/tests/test_models.py
git commit -m "feat(ml): add pydantic API contract models"
```

---

## Task 5: Pipeline stage 1 — parse (PyMuPDF) + fixture PDF

**Files:**
- Create: `ml/lucent_ml/pipeline/__init__.py`, `ml/lucent_ml/pipeline/parse.py`, `ml/tests/conftest.py`, `ml/tests/fixtures/sample-2page.pdf`, `ml/tests/test_parse.py`

- [ ] **Step 1: Generate the committed fixture PDF**

Create `ml/tests/_make_fixture.py` (a one-off generator; commit the output PDF, keep the script for reproducibility):
```python
"""Generate tests/fixtures/sample-2page.pdf — run once, commit the PDF."""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from pathlib import Path

out = Path(__file__).parent / "fixtures" / "sample-2page.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=letter)

page1 = [
    "Photosynthesis converts light energy into chemical energy in plants.",
    "Chlorophyll in the chloroplasts absorbs mostly red and blue light.",
    "The light reactions produce ATP and NADPH on the thylakoid membrane.",
    "The Calvin cycle then fixes carbon dioxide into glucose using that ATP.",
    "Water is split during the light reactions, releasing oxygen as a byproduct.",
]
page2 = [
    "Cellular respiration releases the energy stored in glucose molecules.",
    "Glycolysis breaks glucose into two pyruvate molecules in the cytoplasm.",
    "The citric acid cycle occurs in the mitochondrial matrix.",
    "Oxidative phosphorylation generates most of the cell's ATP.",
    "Oxygen acts as the final electron acceptor in the electron transport chain.",
]
y = 720
for line in page1:
    c.drawString(72, y, line); y -= 24
c.showPage()
y = 720
for line in page2:
    c.drawString(72, y, line); y -= 24
c.showPage()
c.save()
print("wrote", out)
```

Run it:
```bash
cd ml && pip install -e ".[dev]" && python tests/_make_fixture.py
```
Expected: `wrote .../sample-2page.pdf`. Verify the file exists and is ~2KB+.

- [ ] **Step 2: Write `ml/tests/conftest.py`**

```python
from pathlib import Path
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    return (FIXTURES / "sample-2page.pdf").read_bytes()
```

- [ ] **Step 3: Write the failing test `ml/tests/test_parse.py`**

```python
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
```

- [ ] **Step 4: Run, verify it fails**

```bash
cd ml && pytest tests/test_parse.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `ml/lucent_ml/pipeline/__init__.py` (empty) and `ml/lucent_ml/pipeline/parse.py`**

```python
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
```

- [ ] **Step 6: Run, verify it passes**

```bash
cd ml && pytest tests/test_parse.py -v
```
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add ml/lucent_ml/pipeline/ ml/tests/conftest.py ml/tests/test_parse.py ml/tests/_make_fixture.py ml/tests/fixtures/sample-2page.pdf
git commit -m "feat(ml): add parse stage (PyMuPDF words+bboxes) + 2-page fixture"
```

---

## Task 6: Pipeline stage 2 — segment (words → sentences carrying geometry)

**Files:**
- Create: `ml/lucent_ml/pipeline/segment.py`
- Test: `ml/tests/test_segment.py`

- [ ] **Step 1: Write the failing test `ml/tests/test_segment.py`**

```python
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
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pytest tests/test_segment.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ml/lucent_ml/pipeline/segment.py`**

```python
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
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd ml && pytest tests/test_segment.py -v
```
Expected: 3 passed. If syntok splits differently than expected and the photosynthesis assertion fails, relax the substring to the first 4 words — but the geometry + page assertions must hold.

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/pipeline/segment.py ml/tests/test_segment.py
git commit -m "feat(ml): add segment stage (sentences carry page + word bboxes)"
```

---

## Task 7: Pipeline stage 3 — rank (TF-IDF + TextRank → anchors)

**Files:**
- Create: `ml/lucent_ml/pipeline/rank.py`
- Test: `ml/tests/test_rank.py`

- [ ] **Step 1: Write the failing test `ml/tests/test_rank.py`**

```python
from lucent_ml.pipeline.parse import parse_pdf
from lucent_ml.pipeline.segment import segment
from lucent_ml.pipeline.rank import rank, RankedSentence


def test_rank_selects_top_n_with_normalized_scores(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    ranked = rank(sentences, top_n=4)
    assert len(ranked) == 4
    assert all(isinstance(r, RankedSentence) for r in ranked)
    assert all(0.0 <= r.confidence <= 1.0 for r in ranked)
    # ranked are a subset of the input sentences (anchors are REAL sentences)
    src_texts = {s.text for s in sentences}
    assert all(r.sentence.text in src_texts for r in ranked)
    # highest score first
    scores = [r.confidence for r in ranked]
    assert scores == sorted(scores, reverse=True)


def test_rank_top_n_larger_than_corpus_returns_all(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    sentences = segment(words)
    ranked = rank(sentences, top_n=999)
    assert len(ranked) == len(sentences)


def test_rank_empty_returns_empty():
    assert rank([], top_n=5) == []
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pytest tests/test_rank.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ml/lucent_ml/pipeline/rank.py`**

```python
"""Stage 3 — extractive ranking. TF-IDF cosine graph + TextRank (pagerank).

The selected sentences are the ANCHORS: each carries real page+bbox geometry,
so any summary point derived from one is guaranteed verifiable.
"""
from dataclasses import dataclass

import networkx as nx
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .segment import Sentence


@dataclass(frozen=True)
class RankedSentence:
    sentence: Sentence
    confidence: float   # 0..1 normalized score


def rank(sentences: list[Sentence], top_n: int) -> list[RankedSentence]:
    if not sentences:
        return []
    if len(sentences) == 1:
        return [RankedSentence(sentence=sentences[0], confidence=1.0)]

    texts = [s.text for s in sentences]
    vec = TfidfVectorizer(stop_words="english", min_df=1)
    tfidf = vec.fit_transform(texts)
    sim = cosine_similarity(tfidf)

    g = nx.from_numpy_array(sim)
    try:
        pr = nx.pagerank(g, max_iter=200)
    except nx.PowerIterationFailedConvergence:
        pr = {i: float(sim[i].sum()) for i in range(len(sentences))}

    scores = [pr.get(i, 0.0) for i in range(len(sentences))]
    lo, hi = min(scores), max(scores)
    rng = (hi - lo) or 1.0
    norm = [(s - lo) / rng for s in scores]

    order = sorted(range(len(sentences)), key=lambda i: norm[i], reverse=True)
    chosen = order[: max(0, top_n)]
    return [RankedSentence(sentence=sentences[i], confidence=round(norm[i], 4)) for i in chosen]
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd ml && pytest tests/test_rank.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/pipeline/rank.py ml/tests/test_rank.py
git commit -m "feat(ml): add rank stage (TF-IDF + TextRank anchors with normalized scores)"
```

---

## Task 8: bbox line-merge helper (`assemble.py` part 1)

**Files:**
- Create: `ml/lucent_ml/pipeline/assemble.py`
- Test: `ml/tests/test_assemble.py`

- [ ] **Step 1: Write the failing test `ml/tests/test_assemble.py`**

```python
from lucent_ml.pipeline.assemble import merge_line_bboxes


def test_merges_adjacent_boxes_on_same_line():
    # three words on the same text line (similar y), contiguous x
    boxes = [(72.0, 700.0, 100.0, 712.0), (102.0, 700.5, 130.0, 712.0), (132.0, 700.0, 160.0, 712.0)]
    merged = merge_line_bboxes(boxes)
    assert len(merged) == 1
    x0, y0, x1, y1 = merged[0]
    assert x0 == 72.0 and x1 == 160.0
    assert y0 <= 700.0 and y1 >= 712.0


def test_keeps_separate_lines_separate():
    line1 = [(72.0, 700.0, 100.0, 712.0)]
    line2 = [(72.0, 670.0, 140.0, 682.0)]
    merged = merge_line_bboxes(line1 + line2)
    assert len(merged) == 2


def test_empty_returns_empty():
    assert merge_line_bboxes([]) == []
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pytest tests/test_assemble.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ml/lucent_ml/pipeline/assemble.py` (merge helper; full assembler wired in T11)**

```python
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
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd ml && pytest tests/test_assemble.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/pipeline/assemble.py ml/tests/test_assemble.py
git commit -m "feat(ml): add line-level bbox merge helper"
```

---

## Task 9: Pipeline stage 4 — reword (pluggable provider + verbatim fallback)

**Files:**
- Create: `ml/lucent_ml/providers/reword_provider.py`, `ml/lucent_ml/pipeline/reword.py`, `ml/lucent_ml/providers/__init__.py`
- Test: `ml/tests/test_reword.py`

- [ ] **Step 1: Write the failing test `ml/tests/test_reword.py`** (uses a FAKE provider — no model download)

```python
from lucent_ml.pipeline.parse import parse_pdf
from lucent_ml.pipeline.segment import segment
from lucent_ml.pipeline.rank import rank
from lucent_ml.pipeline.reword import reword_anchors


class FakeProvider:
    def reword(self, sentence: str) -> str:
        return "In simple terms: " + sentence.split(".")[0]


def test_reword_produces_one_point_per_anchor(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    ranked = rank(segment(words), top_n=4)
    points = reword_anchors(ranked, provider=FakeProvider())
    assert len(points) == len(ranked)
    for rp in points:
        assert rp.text.startswith("In simple terms:")
        # citation stays bound to the REAL anchor sentence + geometry
        assert rp.anchor.sentence.text
        assert rp.anchor.sentence.word_bboxes


def test_reword_falls_back_to_verbatim_on_provider_error(sample_pdf_bytes):
    pages, words = parse_pdf(sample_pdf_bytes)
    ranked = rank(segment(words), top_n=3)

    class BrokenProvider:
        def reword(self, sentence: str) -> str:
            raise RuntimeError("model unavailable")

    points = reword_anchors(ranked, provider=BrokenProvider())
    assert len(points) == 3
    # fallback: text equals the anchor sentence verbatim
    assert all(p.text == p.anchor.sentence.text for p in points)
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pytest tests/test_reword.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ml/lucent_ml/providers/__init__.py` (empty) and `ml/lucent_ml/providers/reword_provider.py`**

```python
"""Reword providers. Default uses a small transformers summarizer; the model is
loaded lazily so importing this module never triggers a download."""
from typing import Protocol

from ..settings import settings


class RewordProvider(Protocol):
    def reword(self, sentence: str) -> str: ...


class TransformersProvider:
    """Lazy-loads a distilbart summarizer on first use."""
    def __init__(self, model: str | None = None):
        self._model_name = model or settings.REWORD_MODEL
        self._pipe = None

    def _ensure(self):
        if self._pipe is None:
            from transformers import pipeline  # local import = no import-time download
            self._pipe = pipeline("summarization", model=self._model_name)

    def reword(self, sentence: str) -> str:
        self._ensure()
        # Ask for a short plain restatement of a single sentence.
        out = self._pipe(sentence, max_length=40, min_length=8, do_sample=False)
        return out[0]["summary_text"].strip()


def default_provider() -> RewordProvider:
    if settings.REWORD_PROVIDER == "transformers":
        return TransformersProvider()
    # Future: ollama / openai-compatible. For now, transformers is the only built-in.
    return TransformersProvider()
```

- [ ] **Step 4: Implement `ml/lucent_ml/pipeline/reword.py`**

```python
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
```

- [ ] **Step 5: Run, verify it passes**

```bash
cd ml && pytest tests/test_reword.py -v
```
Expected: 2 passed (no model download — fake providers used).

- [ ] **Step 6: Commit**

```bash
git add ml/lucent_ml/providers/ ml/lucent_ml/pipeline/reword.py ml/tests/test_reword.py
git commit -m "feat(ml): add reword stage + pluggable provider with verbatim fallback"
```

---

## Task 10: Pipeline stage 5 — group (KMeans themes)

**Files:**
- Create: `ml/lucent_ml/pipeline/group.py`
- Test: `ml/tests/test_group.py`

- [ ] **Step 1: Write the failing test `ml/tests/test_group.py`** (inject a fake embedder — no model download)

```python
import numpy as np
from lucent_ml.pipeline.group import group_points, ThemeAssignment


class FakeEmbedder:
    """Deterministic 2-cluster embedding by keyword, no model download."""
    def encode(self, texts):
        vecs = []
        for t in texts:
            tl = t.lower()
            if any(k in tl for k in ("photosynthesis", "chlorophyll", "calvin", "light")):
                vecs.append([1.0, 0.0])
            else:
                vecs.append([0.0, 1.0])
        return np.array(vecs)


def test_group_clusters_and_labels():
    texts = [
        "Photosynthesis converts light to energy.",
        "Chlorophyll absorbs light.",
        "Cellular respiration releases energy.",
        "Glycolysis splits glucose.",
    ]
    result = group_points(texts, embedder=FakeEmbedder())
    assert isinstance(result, ThemeAssignment)
    assert len(result.theme_of) == 4
    # the two photosynthesis texts share a theme; respiration texts share the other
    assert result.theme_of[0] == result.theme_of[1]
    assert result.theme_of[2] == result.theme_of[3]
    assert result.theme_of[0] != result.theme_of[2]
    # every theme has a non-empty label
    assert all(lbl.strip() for lbl in result.labels.values())


def test_group_few_points_single_theme():
    texts = ["only one point here", "and a second"]
    result = group_points(texts, embedder=FakeEmbedder())
    # < 4 points → single "Summary" theme
    assert len(set(result.theme_of)) == 1
    assert list(result.labels.values())[0]
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd ml && pytest tests/test_group.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ml/lucent_ml/pipeline/group.py`**

```python
"""Stage 5 — group points into themes via KMeans over embeddings.

The embedder is injected so tests can pass a fake (no model download). The
default embedder lazily loads sentence-transformers."""
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

from ..settings import settings


@dataclass(frozen=True)
class ThemeAssignment:
    theme_of: list[int]            # theme index per input point
    labels: dict[int, str]         # theme index -> label


class STEmbedder:
    """Lazy sentence-transformers embedder."""
    def __init__(self, model: str | None = None):
        self._name = model or settings.EMBED_MODEL
        self._model = None

    def encode(self, texts):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._name)
        return np.asarray(self._model.encode(list(texts)))


def default_embedder() -> STEmbedder:
    return STEmbedder()


def _label_for(texts: list[str]) -> str:
    """Cheap label = top TF-IDF term(s) across the cluster's texts (no LLM)."""
    if not texts:
        return "Summary"
    try:
        vec = TfidfVectorizer(stop_words="english", min_df=1)
        m = vec.fit_transform(texts)
        scores = m.sum(axis=0).A1
        terms = vec.get_feature_names_out()
        top = [terms[i] for i in scores.argsort()[::-1][:2]]
        return " / ".join(t.capitalize() for t in top) if top else "Summary"
    except ValueError:
        return "Summary"


def group_points(texts: list[str], embedder=None) -> ThemeAssignment:
    n = len(texts)
    if n == 0:
        return ThemeAssignment(theme_of=[], labels={})
    if n < 4:
        return ThemeAssignment(theme_of=[0] * n, labels={0: _label_for(texts)})

    embedder = embedder or default_embedder()
    X = embedder.encode(texts)
    k = max(2, min(5, round(n / 3)))
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    assign = km.fit_predict(X).tolist()

    labels: dict[int, str] = {}
    for t_idx in sorted(set(assign)):
        members = [texts[i] for i in range(n) if assign[i] == t_idx]
        labels[t_idx] = _label_for(members)
    return ThemeAssignment(theme_of=assign, labels=labels)
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd ml && pytest tests/test_group.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/pipeline/group.py ml/tests/test_group.py
git commit -m "feat(ml): add theme grouping stage (KMeans + TF-IDF labels)"
```

---

## Task 11: Wire /summarize + the integrity invariant

**Files:**
- Modify: `ml/lucent_ml/app.py`, `ml/lucent_ml/pipeline/assemble.py`
- Test: `ml/tests/test_summarize_e2e.py`

- [ ] **Step 1: Add the response builder to `ml/lucent_ml/pipeline/assemble.py`**

Append to the existing file:
```python
import uuid

from .reword import RewordedPoint
from .group import ThemeAssignment, group_points
from ..models import SummarizeResponse, SummaryPoint, Theme, PageDim
from .parse import PageInfo


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
```

- [ ] **Step 2: Write the failing e2e test `ml/tests/test_summarize_e2e.py`**

The integrity invariant is the core assertion. Uses fake provider+embedder via dependency override so no model downloads in the fast test; a second `@pytest.mark.slow` test exercises the real model.

```python
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


@pytest.mark.slow
def test_summarize_with_real_models(sample_pdf_bytes):
    # No overrides → real transformers + sentence-transformers (downloads on first run).
    client = TestClient(app)
    files = {"file": ("sample-2page.pdf", io.BytesIO(sample_pdf_bytes), "application/pdf")}
    r = client.post("/summarize", files=files, data={"length": "short"})
    assert r.status_code == 200
    assert len(r.json()["points"]) >= 1
```

- [ ] **Step 3: Run, verify it fails**

```bash
cd ml && pytest tests/test_summarize_e2e.py -m "not slow" -v
```
Expected: FAIL — `/summarize`, `get_reword_provider`, `get_embedder` don't exist yet.

- [ ] **Step 4: Implement `/summarize` in `ml/lucent_ml/app.py`** (replace the file)

```python
"""Lucent ML service — FastAPI app."""
import time

from fastapi import FastAPI, UploadFile, File, Form, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings
from .models import ErrorResponse
from .pipeline.parse import parse_pdf, ParseError
from .pipeline.segment import segment
from .pipeline.rank import rank
from .pipeline.reword import reword_anchors
from .pipeline.assemble import build_response
from .providers.reword_provider import default_provider
from .pipeline.group import default_embedder

app = FastAPI(title="Lucent ML", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:3000"],
    allow_methods=["*"], allow_headers=["*"],
)

_MODELS_READY = True


# Dependency-injection seams (overridden in tests with fakes).
def get_reword_provider():
    return default_provider()


def get_embedder():
    return default_embedder()


@app.get("/healthz")
def healthz():
    return {"status": "ok", "modelsLoaded": _MODELS_READY}


@app.post("/summarize")
async def summarize(
    file: UploadFile = File(...),
    length: str = Form("medium"),
    group: bool = Form(True),
    provider=Depends(get_reword_provider),
    embedder=Depends(get_embedder),
):
    t0 = time.perf_counter()
    data = await file.read()

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        return JSONResponse(status_code=413, content=ErrorResponse(
            error="too-large", message=f"file exceeds {settings.MAX_UPLOAD_MB} MB").model_dump())

    try:
        t_parse = time.perf_counter()
        pages, words = parse_pdf(data)
        sentences = segment(words)
        parse_ms = int((time.perf_counter() - t_parse) * 1000)
    except ParseError as e:
        code = "encrypted" if "password" in str(e) else (
            "scanned" if "scanned" in str(e) else "bad-pdf")
        return JSONResponse(status_code=422, content=ErrorResponse(
            error=code, message=str(e)).model_dump())

    top_n = settings.LENGTH_TARGETS.get(length, settings.LENGTH_TARGETS["medium"])
    t_rank = time.perf_counter()
    ranked = rank(sentences, top_n=top_n)
    rank_ms = int((time.perf_counter() - t_rank) * 1000)

    t_word = time.perf_counter()
    points = reword_anchors(ranked, provider=provider)
    reword_ms = int((time.perf_counter() - t_word) * 1000)

    resp = build_response(
        filename=file.filename or "document.pdf",
        pages=pages, points=points,
        embedder=(embedder if group else _SingleThemeEmbedder()),
        timings={
            "parseMs": parse_ms, "rankMs": rank_ms, "rewordMs": reword_ms,
            "totalMs": int((time.perf_counter() - t0) * 1000),
        },
    )
    return JSONResponse(content=resp.model_dump())


class _SingleThemeEmbedder:
    """When group=false, force one theme by returning identical vectors."""
    def encode(self, texts):
        import numpy as np
        return np.ones((len(texts), 2))
```

Note: `group=false` still routes through `group_points`, but with <4 points it already collapses to one theme; the `_SingleThemeEmbedder` guarantees a single theme even for many points. Acceptable for v1.

- [ ] **Step 5: Run, verify it passes**

```bash
cd ml && pytest tests/test_summarize_e2e.py -m "not slow" -v
```
Expected: 2 passed (the integrity test + the non-pdf rejection). The `slow` test is deselected.

- [ ] **Step 6: Run the whole fast suite**

```bash
cd ml && pytest -m "not slow" -v
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add ml/lucent_ml/app.py ml/lucent_ml/pipeline/assemble.py ml/tests/test_summarize_e2e.py
git commit -m "feat(ml): wire /summarize end-to-end + enforce citation integrity invariant"
```

---

## Task 12: Web — types, api client, upload + page shell

**Files:**
- Create: `web/lib/types.ts`, `web/components/UploadZone.tsx`
- Modify: `web/lib/api.ts`, `web/app/page.tsx`
- Test: `web/__tests__/api.summarize.test.ts`

- [ ] **Step 1: Write `web/lib/types.ts` (mirror the contract exactly)**

```ts
export interface PageDim { page: number; width: number; height: number; }
export interface SummaryPoint {
  id: string; text: string; anchorSentence: string; page: number;
  bboxes: [number, number, number, number][]; confidence: number; themeId: string;
}
export interface Theme { id: string; label: string; pointIds: string[]; }
export interface SummarizeResponse {
  docId: string; filename: string; pageCount: number;
  pages: PageDim[]; points: SummaryPoint[]; themes: Theme[];
  timings: Record<string, number>;
}
export type SummaryLength = "short" | "medium" | "detailed";
```

- [ ] **Step 2: Write the failing test `web/__tests__/api.summarize.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { summarize } from "@/lib/api";

beforeEach(() => vi.restoreAllMocks());

describe("summarize", () => {
  it("posts multipart and returns parsed response", async () => {
    const fake = { docId: "d", filename: "a.pdf", pageCount: 1, pages: [], points: [], themes: [], timings: {} };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fake });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2])], "a.pdf", { type: "application/pdf" });
    const res = await summarize(file, "short");
    expect(res.docId).toBe("d");
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.body instanceof FormData).toBe(true);
  });

  it("throws with server error message on 422", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ error: "scanned", message: "no text" }),
    }));
    const file = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    await expect(summarize(file, "medium")).rejects.toThrow(/no text/);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

```bash
cd web && npm run test:run -- __tests__/api.summarize.test.ts
```
Expected: FAIL — `summarize` not exported.

- [ ] **Step 4: Extend `web/lib/api.ts`**

Append:
```ts
import type { SummarizeResponse, SummaryLength } from "./types";

export async function summarize(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("length", length);
  fd.append("group", "true");
  const r = await fetch(`${ML_URL}/summarize`, { method: "POST", body: fd });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ message: `request failed (${r.status})` }));
    throw new Error(body.message ?? "summarization failed");
  }
  return (await r.json()) as SummarizeResponse;
}
```

- [ ] **Step 5: Write `web/components/UploadZone.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";

export function UploadZone({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (f && f.type === "application/pdf") onFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition
        ${dragging ? "border-[var(--accent)] bg-indigo-50" : "border-gray-300"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <p className="text-lg font-medium">Drop a PDF here</p>
      <p className="text-sm text-[var(--muted)] mt-1">or click to choose a file</p>
      <input ref={inputRef} type="file" accept="application/pdf" hidden
why
        onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}
```
(Remove the stray `why` token if present — the input element is: `<input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => handleFiles(e.target.files)} />`.)

- [ ] **Step 6: Replace `web/app/page.tsx` with the shell wiring upload → state**

```tsx
"use client";
import { useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { summarize } from "@/lib/api";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [length] = useState<SummaryLength>("medium");

  async function run(f: File) {
    setFile(f); setLoading(true); setError(null);
    try { setResult(await summarize(f, length)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold mb-6">Lucent</h1>
      {!result && !loading && <UploadZone onFile={run} disabled={loading} />}
      {loading && <p className="text-[var(--muted)]">Summarizing {file?.name}…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {result && <pre className="text-xs overflow-auto">{JSON.stringify(result.points.map(p => p.text), null, 2)}</pre>}
    </main>
  );
}
```
(This is a temporary results dump — replaced by the split view in T13.)

- [ ] **Step 7: Run tests + tsc**

```bash
cd web && npm run test:run -- __tests__/api.summarize.test.ts && npx tsc --noEmit
```
Expected: 2 passed; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add web/lib/types.ts web/lib/api.ts web/components/UploadZone.tsx web/app/page.tsx web/__tests__/api.summarize.test.ts
git commit -m "feat(web): add contract types, summarize client, upload zone + shell"
```

---

## Task 13: Web — PDF canvas + summary panel/cards (no beams yet)

**Files:**
- Create: `web/components/PdfCanvas.tsx`, `web/components/SummaryPanel.tsx`, `web/components/SummaryCard.tsx`
- Modify: `web/app/page.tsx`, `web/package.json` (add react-pdf)
- Test: `web/__tests__/SummaryCard.test.tsx`

- [ ] **Step 1: Install react-pdf**

```bash
cd web && npm install react-pdf
```

- [ ] **Step 2: Write the failing test `web/__tests__/SummaryCard.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummaryCard } from "@/components/SummaryCard";
import type { SummaryPoint } from "@/lib/types";

const pt: SummaryPoint = {
  id: "p1", text: "Plain point.", anchorSentence: "Original source sentence.",
  page: 3, bboxes: [[1, 2, 3, 4]], confidence: 0.75, themeId: "t1",
};

describe("SummaryCard", () => {
  it("renders text, page, and a confidence bar", () => {
    render(<SummaryCard point={pt} active={false} onActivate={() => {}} />);
    expect(screen.getByText("Plain point.")).toBeInTheDocument();
    expect(screen.getByText(/p\.?\s*3/i)).toBeInTheDocument();
    expect(screen.getByTestId("confidence-bar")).toHaveStyle({ width: "75%" });
  });

  it("calls onActivate when clicked", () => {
    const onActivate = vi.fn();
    render(<SummaryCard point={pt} active={false} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledWith("p1");
  });

  it("shows the anchor sentence when expanded", () => {
    render(<SummaryCard point={pt} active onActivate={() => {}} />);
    expect(screen.getByText("Original source sentence.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, verify it fails**

```bash
cd web && npm run test:run -- __tests__/SummaryCard.test.tsx
```
Expected: FAIL — `SummaryCard` not found.

- [ ] **Step 4: Implement `web/components/SummaryCard.tsx`**

```tsx
"use client";
import { forwardRef } from "react";
import type { SummaryPoint } from "@/lib/types";

interface Props { point: SummaryPoint; active: boolean; onActivate: (id: string) => void; }

export const SummaryCard = forwardRef<HTMLButtonElement, Props>(function SummaryCard(
  { point, active, onActivate }, ref,
) {
  return (
    <button
      ref={ref}
      onClick={() => onActivate(point.id)}
      data-point-id={point.id}
      className={`w-full text-left rounded-xl border p-4 mb-3 transition bg-[var(--card)]
        ${active ? "border-[var(--accent)] shadow-md" : "border-gray-200 hover:border-gray-300"}`}
    >
      <p className="text-sm leading-relaxed">{point.text}</p>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-[var(--muted)]">p. {point.page}</span>
        <div className="h-1.5 flex-1 bg-gray-100 rounded">
          <div data-testid="confidence-bar" className="h-1.5 rounded bg-[var(--accent)]"
            style={{ width: `${Math.round(point.confidence * 100)}%` }} />
        </div>
      </div>
      {active && (
        <p className="mt-3 text-xs text-[var(--muted)] italic border-l-2 border-gray-200 pl-2">
          {point.anchorSentence}
        </p>
      )}
    </button>
  );
});
```

- [ ] **Step 5: Implement `web/components/SummaryPanel.tsx`**

```tsx
"use client";
import { SummaryCard } from "./SummaryCard";
import type { SummaryPoint } from "@/lib/types";

interface Props {
  points: SummaryPoint[];
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export function SummaryPanel({ points, activeId, onActivate, cardRefs }: Props) {
  return (
    <div className="overflow-y-auto h-full p-4">
      {points.map((p) => (
        <SummaryCard
          key={p.id}
          point={p}
          active={activeId === p.id}
          onActivate={onActivate}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement `web/components/PdfCanvas.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { SummaryPoint, PageDim } from "@/lib/types";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  file: File;
  pages: PageDim[];
  points: SummaryPoint[];
  activeId: string | null;
  /** registers a highlight rect (screen coords) for a point's source region */
  registerHighlight: (id: string, el: HTMLDivElement | null) => void;
  renderScale?: number;
}

export function PdfCanvas({ file, pages, points, activeId, registerHighlight, renderScale = 1.2 }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [url, setUrl] = useState<string>("");

  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);

  return (
    <div className="overflow-y-auto h-full bg-gray-50">
      {url && (
        <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum = i + 1;
            const dim = pages.find((p) => p.page === pageNum);
            const pagePoints = points.filter((p) => p.page === pageNum);
            return (
              <div key={pageNum} className="relative mx-auto my-4 w-fit">
                <Page pageNumber={pageNum} scale={renderScale} renderTextLayer renderAnnotationLayer={false} />
                {/* overlay highlights: scale bbox from PDF point space to rendered px */}
                {dim && pagePoints.map((p) =>
                  p.bboxes.map((b, bi) => {
                    const [x0, y0, x1, y1] = b;
                    const style = {
                      left: x0 * renderScale, top: y0 * renderScale,
                      width: (x1 - x0) * renderScale, height: (y1 - y0) * renderScale,
                    };
                    return (
                      <div
                        key={`${p.id}-${bi}`}
                        ref={(el) => registerHighlight(p.id, el)}
                        data-highlight-for={p.id}
                        className={`absolute rounded-sm transition ${
                          activeId === p.id ? "bg-indigo-300/50 ring-1 ring-[var(--accent)]" : "bg-transparent"
                        }`}
                        style={style}
                      />
                    );
                  }),
                )}
              </div>
            );
          })}
        </Document>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Update `web/app/page.tsx` to the split view (still no beams)**

```tsx
"use client";
import { useRef, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { PdfCanvas } from "@/components/PdfCanvas";
import { SummaryPanel } from "@/components/SummaryPanel";
import { summarize } from "@/lib/api";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [length] = useState<SummaryLength>("medium");

  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const highlightRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  async function run(f: File) {
    setFile(f); setLoading(true); setError(null);
    try { setResult(await summarize(f, length)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  if (!result) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Lucent</h1>
        {loading ? <p className="text-[var(--muted)]">Summarizing {file?.name}…</p>
          : <UploadZone onFile={run} disabled={loading} />}
        {error && <p className="text-red-600 mt-4">{error}</p>}
      </main>
    );
  }

  return (
    <main className="h-screen grid grid-cols-[60%_40%]">
      {file && (
        <PdfCanvas
          file={file} pages={result.pages} points={result.points} activeId={activeId}
          registerHighlight={(id, el) => { if (el) highlightRefs.current.set(id, el); else highlightRefs.current.delete(id); }}
        />
      )}
      <SummaryPanel points={result.points} activeId={activeId} onActivate={setActiveId} cardRefs={cardRefs} />
    </main>
  );
}
```

- [ ] **Step 8: Run tests + tsc**

```bash
cd web && npm run test:run -- __tests__/SummaryCard.test.tsx && npx tsc --noEmit
```
Expected: 3 passed; tsc clean. (PdfCanvas isn't unit-tested — react-pdf needs a real worker; it's covered by manual smoke + the geometry test in T14.)

- [ ] **Step 9: Commit**

```bash
git add web/components/ web/app/page.tsx web/package.json web/package-lock.json web/__tests__/SummaryCard.test.tsx
git commit -m "feat(web): add PDF canvas with bbox highlights + summary panel/cards"
```

---

## Task 14: Web — pure bezier geometry (`geometry.ts`) + tests

**Files:**
- Create: `web/lib/geometry.ts`
- Test: `web/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing test `web/__tests__/geometry.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { beamPath, type Rect } from "@/lib/geometry";

const card: Rect = { left: 600, top: 100, right: 1000, bottom: 140 };   // summary side (right)
const src: Rect = { left: 100, top: 300, right: 300, bottom: 320 };     // pdf side (left)

describe("beamPath", () => {
  it("returns a cubic bezier 'd' string with M and C commands", () => {
    const d = beamPath(card, src);
    expect(d).toMatch(/^M /);
    expect(d).toContain(" C ");
  });

  it("starts at the card's left-center and ends at the source's right-center", () => {
    const d = beamPath(card, src);
    // start = card.left, midY of card; end = src.right, midY of src
    expect(d.startsWith("M 600 120")).toBe(true);
    expect(d.trim().endsWith("300 310")).toBe(true);
  });

  it("control points pull horizontally between the endpoints", () => {
    const d = beamPath(card, src);
    // C c1x c1y c2x c2y endx endy — c1x should be left of start, c2x right of end
    const nums = d.replace("M", "").replace("C", "").trim().split(/\s+/).map(Number);
    const [sx, , c1x, , c2x] = nums;
    expect(c1x).toBeLessThan(sx);     // bows toward the source
    expect(c2x).toBeGreaterThan(src.right);
  });

  it("is deterministic for the same inputs", () => {
    expect(beamPath(card, src)).toBe(beamPath(card, src));
  });
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd web && npm run test:run -- __tests__/geometry.test.ts
```
Expected: FAIL — `geometry` not found.

- [ ] **Step 3: Implement `web/lib/geometry.ts`**

```ts
export interface Rect { left: number; top: number; right: number; bottom: number; }

/**
 * Cubic-bezier beam from a summary card (right panel) to a source highlight
 * (left/PDF panel). Start = card's left-center, end = source's right-center.
 * Control points bow horizontally toward each side for a smooth arc.
 * Pure function — no DOM, fully unit-testable.
 */
export function beamPath(card: Rect, source: Rect): string {
  const sx = card.left;
  const sy = (card.top + card.bottom) / 2;
  const ex = source.right;
  const ey = (source.top + source.bottom) / 2;

  const dx = Math.abs(sx - ex);
  const pull = Math.max(40, dx * 0.4);

  const c1x = sx - pull;   // pull left from the card toward the source
  const c1y = sy;
  const c2x = ex + pull;   // pull right from the source toward the card
  const c2y = ey;

  return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
}
```

- [ ] **Step 4: Run, verify it passes**

```bash
cd web && npm run test:run -- __tests__/geometry.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add web/lib/geometry.ts web/__tests__/geometry.test.ts
git commit -m "feat(web): add pure bezier beam path geometry + tests"
```

---

## Task 15: Web — BeamOverlay + recompute-on-scroll + click-to-verify

**Files:**
- Create: `web/components/BeamOverlay.tsx`, `web/lib/useBeams.ts`
- Modify: `web/app/page.tsx`
- Test: `web/__tests__/BeamOverlay.test.tsx`

- [ ] **Step 1: Write the failing test `web/__tests__/BeamOverlay.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BeamOverlay } from "@/components/BeamOverlay";

function rect(left: number, top: number): DOMRect {
  return { left, top, right: left + 100, bottom: top + 20, width: 100, height: 20, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("BeamOverlay", () => {
  it("renders a path when an active card+highlight pair is provided", () => {
    const card = document.createElement("button");
    const hi = document.createElement("div");
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue(rect(600, 100));
    vi.spyOn(hi, "getBoundingClientRect").mockReturnValue(rect(100, 300));

    const { container } = render(
      <BeamOverlay activeId="p1" cardEl={card} highlightEl={hi} />,
    );
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("d")).toMatch(/^M /);
  });

  it("renders nothing when no active pair", () => {
    const { container } = render(<BeamOverlay activeId={null} cardEl={null} highlightEl={null} />);
    expect(container.querySelector("path")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd web && npm run test:run -- __tests__/BeamOverlay.test.tsx
```
Expected: FAIL — `BeamOverlay` not found.

- [ ] **Step 3: Implement `web/components/BeamOverlay.tsx`**

```tsx
"use client";
import { useLayoutEffect, useState } from "react";
import { beamPath, type Rect } from "@/lib/geometry";

interface Props {
  activeId: string | null;
  cardEl: HTMLElement | null;
  highlightEl: HTMLElement | null;
}

function toRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export function BeamOverlay({ activeId, cardEl, highlightEl }: Props) {
  const [d, setD] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!activeId || !cardEl || !highlightEl) { setD(null); return; }

    let raf = 0;
    const recompute = () => {
      raf = requestAnimationFrame(() => setD(beamPath(toRect(cardEl), toRect(highlightEl))));
    };
    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(cardEl); ro.observe(highlightEl);
    window.addEventListener("scroll", recompute, true);   // capture: catch panel scrolls
    window.addEventListener("resize", recompute);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [activeId, cardEl, highlightEl]);

  if (!d) return null;
  return (
    <svg className="pointer-events-none fixed inset-0 w-screen h-screen z-50" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeOpacity={0.8} />
    </svg>
  );
}
```

- [ ] **Step 4: Implement `web/lib/useBeams.ts` (resolve active DOM nodes from the ref maps)**

```ts
"use client";
import { useEffect, useState } from "react";

export function useActiveEls(
  activeId: string | null,
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>,
  highlightRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
) {
  const [els, setEls] = useState<{ card: HTMLElement | null; hi: HTMLElement | null }>({ card: null, hi: null });
  useEffect(() => {
    if (!activeId) { setEls({ card: null, hi: null }); return; }
    // highlight may mount a tick after the page scrolls into view
    const id = requestAnimationFrame(() =>
      setEls({ card: cardRefs.current.get(activeId) ?? null, hi: highlightRefs.current.get(activeId) ?? null }));
    return () => cancelAnimationFrame(id);
  }, [activeId, cardRefs, highlightRefs]);
  return els;
}
```

- [ ] **Step 5: Wire into `web/app/page.tsx`** — add the overlay + active-element resolution

Add imports:
```tsx
import { BeamOverlay } from "@/components/BeamOverlay";
import { useActiveEls } from "@/lib/useBeams";
```
Inside `Home`, after the refs:
```tsx
  const { card, hi } = useActiveEls(activeId, cardRefs, highlightRefs);
```
In the split-view return, add the overlay as a sibling (before `</main>`):
```tsx
      <BeamOverlay activeId={activeId} cardEl={card} highlightEl={hi} />
```
Also: when a point is activated, scroll its highlight into view. Update `onActivate` passed to `SummaryPanel`:
```tsx
      <SummaryPanel
        points={result.points} activeId={activeId}
        onActivate={(id) => {
          setActiveId(id);
          requestAnimationFrame(() => highlightRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }}
        cardRefs={cardRefs}
      />
```

- [ ] **Step 6: Run tests + tsc**

```bash
cd web && npm run test:run -- __tests__/BeamOverlay.test.tsx && npx tsc --noEmit
```
Expected: 2 passed; tsc clean.

- [ ] **Step 7: Run full web suite**

```bash
cd web && npm run test:run
```
Expected: all green (api, SummaryCard, geometry, BeamOverlay).

- [ ] **Step 8: Commit**

```bash
git add web/components/BeamOverlay.tsx web/lib/useBeams.ts web/app/page.tsx web/__tests__/BeamOverlay.test.tsx
git commit -m "feat(web): add bezier beam overlay with scroll/resize recompute + click-to-verify"
```

---

## Task 16: Web — theme grouping UI, length selector, error states, JSON download, polish

**Files:**
- Create: `web/components/ThemeGroup.tsx`
- Modify: `web/components/SummaryPanel.tsx`, `web/app/page.tsx`
- Test: extend `web/__tests__/SummaryCard.test.tsx` is not needed; add `web/__tests__/themeGroup.test.tsx`

- [ ] **Step 1: Write the failing test `web/__tests__/themeGroup.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeGroup } from "@/components/ThemeGroup";
import type { SummaryPoint, Theme } from "@/lib/types";

const theme: Theme = { id: "t1", label: "Energy", pointIds: ["p1"] };
const points: SummaryPoint[] = [{
  id: "p1", text: "A point.", anchorSentence: "Src.", page: 1,
  bboxes: [[0, 0, 1, 1]], confidence: 0.5, themeId: "t1",
}];

describe("ThemeGroup", () => {
  it("renders the theme label, count, and its points", () => {
    render(<ThemeGroup theme={theme} points={points} activeId={null}
      onActivate={() => {}} cardRefs={{ current: new Map() }} />);
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("A point.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd web && npm run test:run -- __tests__/themeGroup.test.tsx
```
Expected: FAIL — `ThemeGroup` not found.

- [ ] **Step 3: Implement `web/components/ThemeGroup.tsx`**

```tsx
"use client";
import { SummaryCard } from "./SummaryCard";
import type { SummaryPoint, Theme } from "@/lib/types";

interface Props {
  theme: Theme;
  points: SummaryPoint[];
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export function ThemeGroup({ theme, points, activeId, onActivate, cardRefs }: Props) {
  const themePoints = points.filter((p) => theme.pointIds.includes(p.id));
  if (themePoints.length === 0) return null;
  return (
    <section className="mb-6">
      <header className="flex items-center gap-2 mb-2 px-1">
        <h2 className="text-sm font-semibold text-[var(--ink)]">{theme.label}</h2>
        <span className="text-xs text-[var(--muted)] bg-gray-100 rounded-full px-2 py-0.5">{themePoints.length}</span>
      </header>
      {themePoints.map((p) => (
        <SummaryCard key={p.id} point={p} active={activeId === p.id} onActivate={onActivate}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }} />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Update `web/components/SummaryPanel.tsx` to render by theme + header controls**

```tsx
"use client";
import { ThemeGroup } from "./ThemeGroup";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

interface Props {
  result: SummarizeResponse;
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  length: SummaryLength;
  onLengthChange: (l: SummaryLength) => void;
  onDownload: () => void;
}

export function SummaryPanel({ result, activeId, onActivate, cardRefs, length, onLengthChange, onDownload }: Props) {
  return (
    <div className="overflow-y-auto h-full p-4 border-l border-gray-200">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-[var(--surface)] py-2">
        <select value={length} onChange={(e) => onLengthChange(e.target.value as SummaryLength)}
          className="text-sm border rounded-lg px-2 py-1">
          <option value="short">Short</option>
          <option value="medium">Medium</option>
          <option value="detailed">Detailed</option>
        </select>
        <button onClick={onDownload} className="text-sm text-[var(--accent)] hover:underline">
          Download JSON
        </button>
      </div>
      {result.themes.map((t) => (
        <ThemeGroup key={t.id} theme={t} points={result.points} activeId={activeId}
          onActivate={onActivate} cardRefs={cardRefs} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Update `web/app/page.tsx`** — length re-request, download, error state, use new SummaryPanel

Replace the split-view section so it passes the new props and re-runs on length change:
```tsx
  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.filename.replace(/\.pdf$/i, "")}-summary.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function changeLength(l: SummaryLength) {
    setLength(l);
    if (file) { setLoading(true); try { setResult(await summarize(file, l)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  }
```
(Change `const [length] = useState` to `const [length, setLength] = useState`.)
Split-view JSX:
```tsx
  return (
    <main className="h-screen grid grid-cols-[60%_40%]">
      {file && (
        <PdfCanvas file={file} pages={result.pages} points={result.points} activeId={activeId}
          registerHighlight={(id, el) => { if (el) highlightRefs.current.set(id, el); else highlightRefs.current.delete(id); }} />
      )}
      <SummaryPanel result={result} activeId={activeId}
        onActivate={(id) => { setActiveId(id); requestAnimationFrame(() => highlightRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" })); }}
        cardRefs={cardRefs} length={length} onLengthChange={changeLength} onDownload={downloadJson} />
      <BeamOverlay activeId={activeId} cardEl={card} highlightEl={hi} />
    </main>
  );
```

- [ ] **Step 6: Run full web suite + tsc**

```bash
cd web && npm run test:run && npx tsc --noEmit
```
Expected: all green; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add web/components/ThemeGroup.tsx web/components/SummaryPanel.tsx web/app/page.tsx web/__tests__/themeGroup.test.tsx
git commit -m "feat(web): theme grouping UI, length selector, JSON download, error states"
```

---

## Task 17: Full verification + manual smoke + READMEs

**Files:** none (verification) — optionally update `README.md`

- [ ] **Step 1: Run both fast suites**

```bash
cd ml && pytest -m "not slow" -v
cd ../web && npm run test:run && npx tsc --noEmit
```
Expected: all green; tsc clean.

- [ ] **Step 2: Run the real-model e2e once (downloads weights)**

```bash
cd ml && pytest -m slow -v
```
Expected: `test_summarize_with_real_models` passes (first run downloads distilbart + MiniLM; subsequent runs are cached). If it's too slow for your machine, this is the one test allowed to be slow — it proves the real pipeline.

- [ ] **Step 3: Manual smoke**

```bash
# terminal 1
cd ml && uvicorn lucent_ml.app:app --port 8000
# terminal 2
cd web && npm run dev
```
Open http://localhost:3000, upload `ml/tests/fixtures/sample-2page.pdf`. Confirm: summary cards appear grouped by theme; clicking a card draws a beam from the card to the highlighted region on the correct PDF page; scrolling either panel keeps the beam glued; the length selector re-summarizes; Download JSON works.

- [ ] **Step 4: Commit any doc touch-ups**

```bash
git add README.md
git commit -m "docs: finalize Lucent README with run + test instructions"
```

---

## Self-Review

**Spec coverage** against `docs/2026-06-29-lucent-prd.md`:

| Spec section | Task(s) |
|---|---|
| §4 Architecture (2-tier, healthz-gated) | T1–T3 |
| §5 [1] Parse | T5 |
| §5 [2] Segment (geometry-carrying) | T6 |
| §5 [3] Rank (anchors) | T7 |
| §5 [4] Reword (pluggable + fallback) | T9 |
| §5 [5] Group (KMeans themes) | T10 |
| §5 [6] Assemble (bbox line-merge) | T8 + T11 |
| §6 API contract (exact shape) | T4 (models) + T11 (route) + T12 (TS mirror) |
| §6 /healthz | T2 |
| §7 Beam mechanics + click-to-verify + recompute | T14 (geometry) + T15 (overlay) |
| §7 PDF render + bbox scaling | T13 |
| §8 Tech stack | pinned across all tasks (no re-decision) |
| §9 Repo structure | T1 + followed throughout |
| §10 Design direction | T13/T16 (cards, themes, accent, confidence bar) |
| §11 Error handling (encrypted/scanned/oversized/provider-fail/service-down) | T5 (parse errors) + T11 (route errors + fallback) + T3/T12 (service-down via healthz + thrown messages) |
| §12 Performance (models load once, beam rAF) | T9/T10 lazy load + T15 rAF batching |
| §13 Testing (integrity invariant, geometry pure fn) | T11 (invariant) + T14 (geometry) + per-stage tests |
| §14 Milestones | T1→T17 ordering matches |

**Placeholder scan:** No TBD/TODO/"implement later." One stray `why` token was introduced in T12 Step 5's `UploadZone` code block and is explicitly corrected in a parenthetical note immediately below it — the implementer must use the corrected `<input ... />` line.

**Type consistency:** `SummaryPoint` fields (`id,text,anchorSentence,page,bboxes,confidence,themeId`) are identical in pydantic (T4), the integrity test (T11), and the TS mirror (T12). `RankedSentence.confidence`, `RewordedPoint.anchor`, and `Sentence.word_bboxes` thread consistently parse→segment→rank→reword→assemble. `beamPath(card, source)` signature matches its use in `BeamOverlay` (T15) and tests (T14). `merge_line_bboxes` name matches between T8 and T11. The `get_reword_provider`/`get_embedder` DI seam names match between T11's route and its test overrides.

**Gap fixed during review:** the e2e integrity test reconstructs page text with the same `" ".join(word.text)` rule used by `segment._page_text_and_spans`, so the "anchorSentence is a substring" assertion holds. This dependency is called out in T11 Step 2 so the rule stays in sync if segmentation changes.

**Known acceptable limitation:** `group=false` is implemented via a single-theme embedder rather than skipping grouping entirely (documented in T11 Step 4). Fine for v1.
