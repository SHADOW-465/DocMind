# Lucent — PRD / Spec

**Verifiable PDF summarization: every summary point is beam-linked to the exact region of the source PDF it came from.**

**Date:** 2026-06-29
**Status:** Approved design — ready for implementation planning
**Working name:** Lucent (rename freely)

---

## 1. Context & problem

People skim AI summaries but can't trust them — there's no fast way to confirm a claim against the source. Existing PDF summarizers produce a wall of text with, at best, a page number. Lucent makes verification a single glance: each summary point is connected by a visible **bezier beam** to the precise region on the rendered PDF page that produced it. Click a point → the beam lights up and the source region highlights.

The trust guarantee is structural, not cosmetic: **a summary point can never cite a region that doesn't exist**, because each point is *derived from* a real source sentence whose geometry (page + bounding boxes) is captured before any rewording happens.

This is a deliberately small, standalone app — separate from the DocMind compliance engine. It does one thing well: summarize a PDF with citations you can verify.

---

## 2. Goals & non-goals

### Goals
- Upload one PDF, get a plain-language summary in seconds (CPU-only, offline-capable).
- Every summary point links to one or more exact source regions on the rendered PDF.
- Visual verification via bezier beams between the summary panel and the PDF canvas.
- Lightweight ML: classic scikit-learn / networkx for ranking, a small transformers model for rewording. No mandatory paid API.
- A polished split-view UI in the spirit of DocMind.

### Non-goals (v1)
- No DOCX/TXT/image input (PDF only — geometry depends on PyMuPDF word boxes).
- No accounts, auth, or server-side persistence. v1 is stateless: summarize → display → optional local JSON download.
- No chat, Q&A, or multi-document corpora.
- No fine-tuning or training. Off-the-shelf models only.
- No mobile-first layout (desktop split-view is the target; it should not break on tablet, but phones are out of scope).

---

## 3. Users & primary use cases

| User | Use case |
|---|---|
| Student / researcher | Summarize a paper, jump to the exact passage behind each claim |
| Analyst | Skim a long report, verify a stated figure against its source line |
| Anyone wary of AI | Read a summary and instantly check it isn't hallucinated |

**Core user story:** "I upload a 12-page PDF. Within ~15s I see 8–12 summary points grouped into 3–4 themes. I click a point; a beam arcs from it to a highlighted block on page 4. I read that block and confirm the point is accurate."

---

## 4. Architecture

Two-tier, new standalone repo.

```
┌──────────────────────────────┐         ┌───────────────────────────────┐
│  web/  Next.js 16 + React 19  │  HTTP   │  ml/  Python FastAPI service   │
│  - upload                     │ ──────▶ │  - PyMuPDF parse (text+bboxes) │
│  - PDF render (react-pdf)     │  multi- │  - sentence segmentation       │
│  - summary panel (cards)      │  part   │  - extractive ranker (sklearn) │
│  - SVG beam overlay           │ ◀────── │  - abstractive reword (LLM)    │
│  - click-to-verify            │  JSON   │  - theme grouping (KMeans)     │
└──────────────────────────────┘         │  - citation assembler          │
                                           └───────────────────────────────┘
```

**Why split this way:** PyMuPDF (`fitz`) yields text *and* per-word bounding boxes + page numbers in one server-side pass, so geometry and ML live together. The frontend's only geometry job is to render the PDF and overlay regions the backend already computed. Models run locally on CPU; first run downloads weights, then cached.

**Dev runtime:** two processes — `uvicorn` on `:8000`, Next.js on `:3000`. The web app calls the ML service via a single `NEXT_PUBLIC_ML_URL` (default `http://localhost:8000`). A root `docker-compose.yml` and a `make dev` / npm script start both.

---

## 5. The pipeline (core of the product)

Each stage is a pure, independently testable function. Input flows left to right; geometry is attached early and never lost.

```
PDF
 │
 ▼  [1] Parse            PyMuPDF → Page[]{page,width,height}, Word[]{text,bbox,page}
 ▼  [2] Segment          group words into Sentence[]{ text, charSpan, page, wordBboxes[] }
 ▼  [3] Rank             TF-IDF + TextRank over sentences → score each; pick top-N
 │                        → these ranked sentences are the ANCHORS (carry real geometry)
 ▼  [4] Reword           small LLM rewrites each anchor sentence → plain-language point
 │                        (1 anchor → 1 point; LLM changes wording, never the anchor)
 ▼  [5] Group            embed points, KMeans into 3–5 themes, label each cluster
 ▼  [6] Assemble         SummaryPoint[]{ text, anchorSentence, page, bboxes[], confidence }
                          + themes[]; bboxes = union/merge of the anchor's wordBboxes
```

### Stage detail

**[1] Parse — `parse.py`**
- `fitz.open(stream)`; for each page record `width`, `height` (PDF point space).
- `page.get_text("words")` → list of `(x0,y0,x1,y1,word,block,line,word_no)`.
- Output: ordered `Word` list with page + bbox; page dimensions.
- Errors: encrypted PDF → 422 "password-protected"; zero extractable text (scanned) → 422 "no extractable text — this looks like a scanned PDF (OCR not supported in v1)".

**[2] Segment — `segment.py`**
- Reconstruct page text from words (preserving order + offsets), run `syntok` sentence segmentation.
- Map each sentence back to the contiguous `Word`s it spans → collect their bboxes; record `page` and char span.
- A sentence stays on a single page in v1 (a sentence spanning a page break is split at the boundary; both fragments keep their own geometry and are linkable). Output: `Sentence[]`.

**[3] Rank — `rank.py`**
- Build TF-IDF matrix over sentences (scikit-learn `TfidfVectorizer`, english stopwords, min length filter).
- Cosine-similarity graph → TextRank via `networkx.pagerank`. Combine with a length/position prior.
- Select top-N where N scales with document length and the user's "length" setting (Short/Medium/Detailed → e.g. ~6/10/16). Normalize scores to 0..1 = `confidence`.
- These selected `Sentence`s are the anchors. **No anchor = no point**, guaranteeing citation integrity.

**[4] Reword — `reword.py`**
- For each anchor, call the summarizer model (`transformers` pipeline, default `sshleifer/distilbart-cnn-12-6`) to produce a concise plain-language restatement of that single sentence (optionally with a little surrounding context for fluency, but the citation stays bound to the anchor).
- Sequential, batched where the model allows. Deterministic settings (no sampling) for reproducibility.
- Pluggable provider: `REWORD_PROVIDER=transformers|ollama|openai-compatible`. If a provider is unavailable, fall back to returning the trimmed anchor sentence verbatim (degraded but still correct).

**[5] Group — `group.py`** (optional, on by default)
- Embed points with `sentence-transformers/all-MiniLM-L6-v2`.
- KMeans (k = clamp(round(points/3), 2, 5)). Label each cluster by its highest-TF-IDF terms (cheap, no LLM) or a one-line LLM label if a provider is set.
- If grouping fails or <4 points, return a single "Summary" theme.

**[6] Assemble — `assemble.py`**
- Merge each anchor's word bboxes into a small number of line-level rectangles (union adjacent boxes on the same text line) for clean overlays.
- Emit the response contract (§6).

---

## 6. API contract (frozen interface between tiers)

```
POST /summarize
  Content-Type: multipart/form-data
  fields: file (PDF, required), length ("short"|"medium"|"detailed", default "medium"),
          group (bool, default true)

200 →
{
  "docId": "uuid",
  "filename": "report.pdf",
  "pageCount": 12,
  "pages": [ { "page": 1, "width": 612.0, "height": 792.0 }, ... ],   // PDF point space
  "points": [
    {
      "id": "p1",
      "text": "Plain-language summary point.",
      "anchorSentence": "The verbatim source sentence this was derived from.",
      "page": 4,                                  // 1-based
      "bboxes": [ [x0,y0,x1,y1], ... ],           // PDF point coords, line-merged
      "confidence": 0.82,                          // 0..1 normalized rank score
      "themeId": "t2"
    }
  ],
  "themes": [ { "id": "t2", "label": "Methodology", "pointIds": ["p1","p5"] } ],
  "timings": { "parseMs": 120, "rankMs": 80, "rewordMs": 4200, "totalMs": 4600 }
}

422 → { "error": "code", "message": "human-readable" }   // encrypted, scanned, too-large, bad-pdf
413 → file exceeds MAX_UPLOAD_MB (default 25)
500 → { "error": "internal", "message": "..." }
```

`GET /healthz` → `{ "status": "ok", "modelsLoaded": true }` (frontend waits on this before enabling upload).

The frontend never recomputes geometry — it scales `bboxes` from PDF point space to rendered canvas pixels using `pages[].width/height` and the rendered scale.

---

## 7. Frontend behavior & citation/beam mechanics

**Layout:** left ~60% rendered PDF (scrollable, all pages), right ~40% scrollable list of summary cards grouped by theme. A full-canvas absolutely-positioned **SVG overlay** sits above both, in document coordinates of the app shell.

**Beam rendering:**
- Each summary card and each rendered source highlight expose live screen rects (React refs + a single `ResizeObserver` + scroll listener on both panels).
- For the **active** point: draw a cubic bézier `<path>` from the card's inner edge → the source highlight's edge. Control points offset horizontally (e.g. ±40% of the gap) for a smooth arc. The source region gets a highlight rectangle; the page auto-scrolls into view if off-screen.
- Inactive points: dimmed; no beam. Hover previews a faint beam; click pins it. A scrim dims the rest when a beam is active.
- Beams recompute on scroll/resize/zoom so they stay glued to their endpoints. Multiple pinned beams allowed (config) but default is one-at-a-time for clarity.

**Interactions:** upload (drag-drop or picker) → progress while ML runs → results. Length selector (Short/Medium/Detailed) re-requests. Each card shows the point text, a confidence bar, theme chip, and a "show source" affordance. Optional "Download summary + citations (JSON)".

**Render lib:** `react-pdf` (pdf.js) for the canvas + text layer; our own overlay layer for highlights and beams.

---

## 8. Tech stack (decided)

| Concern | Choice | Notes |
|---|---|---|
| PDF parse + geometry | **PyMuPDF (`fitz`)** | text + word bboxes + page dims, one pass |
| Sentence segmentation | **syntok** | offset-preserving, dependency-light |
| Extractive ranking | **scikit-learn** TF-IDF + **networkx** pagerank (TextRank) | classic, offline |
| Embeddings | **sentence-transformers** `all-MiniLM-L6-v2` (~80MB) | ranking aux + grouping; CPU-fine |
| Theme grouping | **scikit-learn** KMeans | k clamped 2–5 |
| Abstractive reword | **transformers** `sshleifer/distilbart-cnn-12-6` (default) | small; pluggable to Ollama / OpenAI-compatible via env |
| ML API | **FastAPI + uvicorn**, **pydantic** models | typed contract |
| Frontend | **Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4** | DocMind-like shell |
| PDF render | **react-pdf** (pdf.js) | canvas + text layer |
| Beams | hand-rolled **SVG cubic-bézier** overlay | full curve control |
| Frontend tests | **Vitest** + Testing Library | beam-geometry + components |
| Python tests | **pytest** | per-stage + e2e |
| Dev orchestration | **docker-compose** + npm script | two processes |

Hard rules: models load once at service startup (warm); `/summarize` is CPU-bound and may take seconds — frontend shows determinate-ish progress. Max upload 25 MB / configurable. All processing in-memory; nothing persisted server-side in v1.

---

## 9. Repository structure

```
lucent/
├── README.md
├── docker-compose.yml
├── docs/
│   ├── 2026-06-29-lucent-prd.md          (this file)
│   └── 2026-06-29-lucent-plan.md         (implementation plan)
├── ml/                                    Python service
│   ├── pyproject.toml
│   ├── lucent_ml/
│   │   ├── app.py                         FastAPI app + routes (/summarize, /healthz)
│   │   ├── models.py                      pydantic request/response models
│   │   ├── pipeline/
│   │   │   ├── parse.py  segment.py  rank.py  reword.py  group.py  assemble.py
│   │   ├── providers/reword_provider.py   transformers|ollama|openai-compatible
│   │   └── settings.py                    env config
│   └── tests/
│       ├── fixtures/sample-2page.pdf
│       └── test_parse.py … test_pipeline_e2e.py
└── web/                                    Next.js app
    ├── package.json  tsconfig.json  tailwind/postcss config
    ├── app/  (page.tsx, layout.tsx, globals.css)
    ├── components/
    │   ├── UploadZone.tsx  PdfCanvas.tsx  SummaryPanel.tsx
    │   ├── SummaryCard.tsx  BeamOverlay.tsx  ThemeGroup.tsx
    ├── lib/  (api.ts, geometry.ts, useBeams.ts, types.ts)
    └── __tests__/  (geometry.test.ts, BeamOverlay.test.tsx, SummaryCard.test.tsx)
```

---

## 10. Design direction (light, per request)
- Reuse DocMind's feel: neutral surface, rounded cards, generous spacing, subtle framer-motion-style transitions, a single accent color.
- Split view: PDF left, summary right. Active beam + its two endpoints use the accent; everything else desaturates behind a soft scrim.
- Confidence shown as a thin bar on each card. Theme groups are labeled section headers with a count.
- Keep it calm and legible; the beams are the hero interaction — don't compete with them visually.

---

## 11. Error handling
- Encrypted / password-protected PDF → 422, friendly message.
- Scanned PDF (no text layer) → 422, explain OCR is out of scope for v1.
- Corrupt / non-PDF → 422.
- Oversized file → 413.
- Model/provider failure during reword → degrade to verbatim anchor sentences (still correct citations), surface a non-blocking notice.
- ML service down → frontend shows a clear "summarization service unavailable" state (gated by `/healthz`).

## 12. Performance targets (v1, CPU)
- ≤ 20-page typical PDF: end-to-end under ~15s warm.
- Models loaded once at startup; no per-request load.
- Beam recompute: 60fps on scroll for ≤ ~30 points (batch DOM reads, single rAF write).

## 13. Testing strategy
- **Python (pytest):** one committed 2-page fixture PDF. Unit-test each stage. The integrity test is mandatory: for every emitted point, assert (a) its `anchorSentence` is a substring of the reconstructed source text, and (b) every bbox lies within its page's dimensions. One full `/summarize` e2e test asserting the contract shape + integrity invariant.
- **Frontend (Vitest):** `geometry.ts` pure function (two rects → expected bézier path `d` string); `SummaryCard` render; `BeamOverlay` recompute on simulated scroll/resize. API client mocked.
- **Manual smoke:** upload the fixture, click points, confirm beams land on the right regions.

## 14. Milestones (high level — detailed in the plan)
1. Repo scaffold (both tiers) + health check wired end-to-end.
2. ML pipeline stages 1–3 (parse→segment→rank) + integrity tests.
3. ML stages 4–6 (reword→group→assemble) + `/summarize` e2e.
4. Frontend shell + upload + PDF render + summary cards (no beams yet).
5. Bezier beam overlay + click-to-verify + geometry tests.
6. Theme grouping UI, length selector, error states, JSON download, polish.

## 15. Risks & mitigations
- **Word→sentence bbox mapping drift** (PyMuPDF word order vs syntok offsets) → reconstruct sentences *from* the word list directly rather than re-tokenizing raw text; integrity test catches regressions.
- **distilbart wording strays from anchor meaning** → keep citation bound to the anchor (not the reworded text); show `anchorSentence` on demand; allow verbatim fallback.
- **Beam jank on scroll** → batch reads, single rAF write, observe only the two panels.
- **Large model cold start** → load at startup, gate UI on `/healthz`.
- **Scanned PDFs** → detect and reject clearly in v1; OCR is a named future enhancement.

## 16. Future enhancements (explicitly out of v1)
DOCX/TXT input; OCR for scanned PDFs; multi-document; persistence + shareable links; export to annotated PDF; swap-in larger local LLM via Ollama; cross-page sentence linking; highlight-on-the-PDF export.
