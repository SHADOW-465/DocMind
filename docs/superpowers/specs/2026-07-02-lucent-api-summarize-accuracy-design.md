# Lucent API Summarization Accuracy — Design Spec

**Date:** 2026-07-02
**Status:** Approved by user — ready for implementation planning
**Builds on:** `docs/2026-06-29-lucent-prd.md` (original product spec), `web/app/api/summarize/route.ts` + `web/lib/api.ts` (existing serverless fallback path, added outside this session)

---

## 1. Context & problem

Lucent has two summarization paths:

1. **Python ML service** (`ml/`) — the original, tested pipeline: PyMuPDF parse → syntok segment → TF-IDF/TextRank rank (real confidence scores) → reword (transformers or the `api` provider) → KMeans group → assembled response. Citation integrity is structurally guaranteed: every point's `anchorSentence`/`page`/`bboxes` come straight from a real ranked sentence.

2. **Next.js serverless fallback** (`web/app/api/summarize/route.ts` + `lib/api.ts`), added later so a Vercel-only deployment (no hosted Python backend) can still summarize. This path does something architecturally different and much weaker: it sends **every sentence** in the document to an LLM in one shot and asks it to both *pick* the important ones *and* rewrite them *and* group them, trusting the model's chosen index back into the client's bbox array.

The user's report — "working but not accurate" — is about path 2. Reading the code surfaces exactly why:

- **No selection guardrail.** The LLM chooses which sentences matter with zero ranking signal; on longer documents this degrades further because *all* sentences are dumped into one prompt with no length-aware curation.
- **Confidence is fabricated.** `confidence: Number((0.95 - outPoints.length * 0.02).toFixed(2))` — a formula based on array position, not the model or any real signal. The UI's confidence bar is showing noise.
- **Naive sentence segmentation.** The client-side segmenter in `summarizeWithApiFallback` splits on `[.!?]$` with a small abbreviation blocklist — no per-page reconstruction discipline like the Python `segment.py`, so bbox-to-sentence mapping is looser than the ML path's.
- **Small, dated model.** `llama-3.1-8b-instant` / `meta/llama-3.1-8b-instruct` — small 8B models asked to simultaneously rank, rewrite, and group in one JSON blob is a lot to ask reliably.
- **Weak index validation.** `sentences[sentenceIdx] || sentences[0]` — if the LLM hallucinates an out-of-range index, the code silently substitutes `sentences[0]` and presents it as if it were the model's real citation. This is the most serious bug: it can silently **misattribute a summary point to the wrong source sentence**, which is the one thing Lucent is supposed to make impossible.

This spec fixes all of that by making the LLM's job strictly *bounded*: it may only select and rephrase from a pre-ranked, index-labeled candidate list — never invent, never get silently remapped.

---

## 2. Architecture: hybrid select-then-verify

All geometry and selection-candidate work moves to **pure, deterministic, client-side TypeScript** (mirroring the already-proven Python pipeline). The LLM's role shrinks to what LLMs are actually good at — picking the best subset and rewording them — and its output is validated before anything reaches the UI.

```
pdf.js word extraction (existing, in api.ts)
        │
        ▼  segment.ts   — Intl.Segmenter, per-page, carries word bboxes (mirrors ml/segment.py)
   Sentence[] { text, page, bboxes }
        │
        ▼  rank.ts      — TF-IDF cosine graph + PageRank, position-prior fallback (mirrors ml/rank.py)
   RankedSentence[] { sentence, confidence }      ← REAL 0..1 scores, not fabricated
        │
        ▼  take top-K candidates (K = clamp(2.5 × N, N, 40); N = length target: 6/10/16)
   { index, text }[]  — index is the candidate's position in THIS bounded list
        │
        ▼  POST /api/summarize  { candidates, length }
   ┌─────────────────────────────────────────────────────────┐
   │ LLM (JSON mode, temp 0): select N of the candidates,      │
   │ reword each, group into 2–5 themes. Must reference        │
   │ candidates ONLY by index.                                 │
   │                                                            │
   │ Server-side validation before responding:                 │
   │  - JSON schema shape                                      │
   │  - every referenced index is in-range AND unique          │
   │  - invalid entries are DROPPED (never remapped/guessed)   │
   └─────────────────────────────────────────────────────────┘
        │
        ▼  assemble.ts  — client binds each returned point to ITS OWN candidate:
   SummaryPoint {
     anchorSentence: candidate.text        (verbatim, never the reworded text)
     page, bboxes: candidate.sentence's real geometry
     confidence: candidate's REAL rank score (not a position formula)
     text: LLM's reworded point
   }
        │
        ▼  shortfall handling: if the LLM returns fewer valid points than N
           (because some were dropped), fill the remainder from the next-
           highest-ranked unused candidates, verbatim (no reword) — same
           "degrade to verbatim, never to a wrong citation" philosophy as
           the Python path's reword fallback.
```

**Why this restores the trust guarantee:** a point's citation is never derived from anything the LLM writes back except a bounded integer index, and that index is validated against the *known* candidate list before use. A hallucinated index is provably detectable (out of `[0, K)`) and is dropped, not guessed-around. This mirrors the Python pipeline's core invariant — "no anchor = no point" — on the serverless path for the first time.

---

## 3. New / changed modules

### New, pure, unit-tested (no DOM) — `web/lib/summarize/`
- **`segment.ts`** — `segmentIntoSentences(words: ExtractedWord[]): Sentence[]`. Per-page reconstruction (mirrors `_page_text_and_spans` in `ml/segment.py`): join words, run `Intl.Segmenter({ granularity: "sentence" })` per page, map each sentence's char span back to the words it covers, collect bboxes. A sentence never spans pages (segmented per-page, same rule as Python).
- **`rank.ts`** — `rankSentences(sentences: Sentence[], topN: number): RankedSentence[]`. TF-IDF-ish term-frequency cosine similarity graph + a PageRank-style iterative score (small, dependency-free implementation — no need for a full ML library client-side); degenerate/all-stopword input falls back to a position prior (mirrors the Python `rank.py` fix from the earlier ML review). Returns real, normalized 0..1 confidence.
- **`assemble.ts`** — `mergeLineBboxes` (moved here verbatim from today's `lib/api.ts`) + `bindPointsToCandidates(llmResult, candidates)` — the validation + binding step described above (drops invalid indices, never substitutes a fallback index).

### Changed
- **`web/app/api/summarize/route.ts`** — request shape changes from `{ sentences: string[], length }` to `{ candidates: { index, text }[], length }`. System prompt rewritten to: "select exactly N of the following indexed candidates, reword each, group into 2-5 themes; you may ONLY reference candidates by their given index; do not invent new text as an index." Server validates every returned index is an integer in `[0, candidates.length)` and appears at most once; invalid entries are filtered out before responding (the client still does its own defensive check in `assemble.ts` — belt and suspenders, since the route and the client-binding step are both boundaries the LLM's output crosses).
- **`web/lib/api.ts`** — `summarizeWithApiFallback` shrinks to orchestration: pdf.js extraction (unchanged) → `segmentIntoSentences` → `rankSentences` → take top-K candidates → POST → `bindPointsToCandidates` → shortfall fill → build `SummarizeResponse`. The inline segmentation, ad hoc confidence formula, and the `sentences[sentenceIdx] || sentences[0]` fallback are all removed.
- **Models, both paths** — bumped from 8B to a stronger model, since the LLM's remaining job (select + reword + group, still nontrivial) benefits from more capability:
  - Groq default: `llama-3.1-8b-instant` → `llama-3.3-70b-versatile`
  - NVIDIA NIM default: `meta/llama-3.1-8b-instruct` → `meta/llama-3.3-70b-instruct`
  - Applied in both `ml/lucent_ml/settings.py` (Python path) and `web/app/api/summarize/route.ts` (serverless path), plus `ml/.env.example`, so the two "API mode" paths stay aligned. Both remain env-overridable.
- **JSON reliability:** the route requests `response_format: { type: "json_object" }` from the chat completion (both NIM and Groq support OpenAI-compatible JSON mode) instead of relying solely on brace-slicing the raw text; the existing brace-extraction is kept as a fallback parser for a backend that ignores the flag.

---

## 4. Failure ladder (every step preserves correct citations, never a wrong one)

1. LLM returns a well-formed response, all indices valid → full accuracy gain (real ranking + real rewording + real grouping).
2. Some indices invalid/duplicate → those specific points are dropped, not remapped.
3. Fewer valid points than the length target → shortfall filled from the next-highest-ranked *unused* candidates, verbatim text, real confidence — same "verbatim fallback still correct" philosophy as the Python `reword.py`.
4. Both NIM and Groq fail entirely → existing `502 api-failed` behavior is unchanged; the client's existing error surface (the `checkHealth`/error-message path from the earlier healthz work) is untouched.
5. No API keys configured → existing `500 not-configured` behavior is unchanged.

At no point does an out-of-range or hallucinated index get silently coerced into *some* citation — that was the core bug being fixed.

---

## 5. Testing strategy

- **`segment.test.ts`** — mirrors `ml/tests/test_segment.py` intent: sentences carry correct page + bboxes, per-page segmentation (no cross-page sentences), reconstructable text.
- **`rank.test.ts`** — mirrors `ml/tests/test_rank.py`: top-N selection, normalized 0..1 scores, descending order, degenerate all-stopword input doesn't throw (position-prior fallback), empty input → empty output.
- **`assemble.test.ts`** — the accuracy-critical test: given an LLM result containing a valid index, an out-of-range index, and a duplicate index, `bindPointsToCandidates` keeps only the valid one and its `anchorSentence`/`bboxes`/`confidence` come from the correct candidate — proves a hallucinated index cannot produce a wrong citation.
- **Route test** (`app/api/summarize/route.test.ts` or equivalent, mocked fetch) — valid path returns filtered/validated output; a response containing a hallucinated index has that index stripped before the route responds; NIM-fails→Groq-succeeds fallback (already partially covered by the existing route, extend for the new payload shape); no-keys → 500.
- Existing 16 web tests (api, api.summarize, SummaryCard, geometry, BeamOverlay, themeGroup, healthGate) must keep passing unmodified.
- `ml/` suite is untouched by this spec except the two model-default constants in `settings.py` (no logic change, existing 29 tests stay green).

---

## 6. Non-goals

- No change to the Python ML pipeline's algorithm (parse/segment/rank/reword/group) — only its two model-name defaults move in lockstep with the serverless path for consistency.
- No change to the `/summarize` HTTP contract between `web/` and `ml/` — this spec only touches the serverless (`/api/summarize`) fallback path and its client orchestration.
- No new UI — the existing `SummaryCard`/`ThemeGroup`/`BeamOverlay` rendering is unaffected; only the *data* feeding them (via `lib/api.ts`) becomes accurate.
- No introduction of a heavy client-side ML/NLP dependency — `rank.ts`'s TF-IDF/PageRank is a small dependency-free implementation appropriate for browser execution on typical document sizes.

## 7. Future enhancements (explicitly out of this spec)
Client-side KMeans-style embedding-based theme grouping (today's grouping stays LLM-driven, same as the current serverless design) — the Python path's `sentence-transformers` grouping isn't practical to run in-browser and isn't part of this accuracy fix; that's a separate, later improvement if theme quality becomes the next issue.
