# API Summarization Accuracy Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inaccurate summaries on Lucent's serverless (`/api/summarize`) fallback path by replacing its one-shot "LLM ranks + rewrites + groups everything, with an unsafe index fallback" design with a hybrid pipeline: deterministic client-side ranking picks real candidates with real confidence scores, and the LLM's output is strictly validated so a hallucinated index can never produce a wrong citation.

**Architecture:** New pure TypeScript modules (`web/lib/summarize/{types,segment,rank,assemble}.ts`) mirror the already-proven Python `ml/lucent_ml/pipeline/{segment,rank}.py` stages — segment PDF words into sentences carrying real geometry, then rank them via TF-IDF + PageRank into real 0..1 confidence scores. Only a bounded, index-labeled top-K candidate list is sent to the LLM (`/api/summarize`), which may select/reword/group but can only *reference* candidates by index. Both the route and the client validate that index before it can become a citation; invalid/duplicate indices are dropped, never remapped. A shortfall is filled from unused top-ranked candidates, verbatim.

**Tech Stack:** TypeScript, Vitest + Testing Library (existing web stack), `Intl.Segmenter` (no new runtime dependency), Next.js Route Handlers, Python 3.11+ (one settings-only change).

**Source spec:** `docs/superpowers/specs/2026-07-02-lucent-api-summarize-accuracy-design.md`

---

## File Structure

```
web/lib/summarize/
├── types.ts        T1  — ExtractedWord, Sentence, RankedSentence, LlmCandidate, LENGTH_TARGETS, candidateCount()
├── segment.ts       T2  — segmentIntoSentences()
├── rank.ts          T3  — rankSentences()
└── assemble.ts       T4  — mergeLineBboxes() (moved from lib/api.ts), bindPointsToCandidates()

web/__tests__/summarize/
├── types.test.ts     T1
├── segment.test.ts   T2
├── rank.test.ts       T3
└── assemble.test.ts   T4

web/app/api/summarize/route.ts   T5  — MODIFY: candidates contract, JSON mode, server-side index validation, model bump
web/__tests__/api.route.summarize.test.ts   T5  — NEW

web/lib/api.ts        T6  — MODIFY: summarizeWithApiFallback rewritten onto the new pipeline; old inline
                              segmentation / fabricated confidence / unsafe index fallback removed

ml/lucent_ml/settings.py   T7  — MODIFY: NIM_MODEL, GROQ_MODEL defaults bumped to Llama 3.3 70B
ml/.env.example              T7  — MODIFY: matching comment defaults
```

**Decomposition rationale:** Each pipeline stage is a pure, independently testable module, mirroring the file-per-stage pattern already used in `ml/lucent_ml/pipeline/`. `assemble.ts` is the single place a candidate index is validated and bound to a `SummaryPoint` — isolating the citation-integrity logic in one small, thoroughly tested file is the most important structural decision in this plan.

**Two test-isolation notes:**
- The new route test (T5) runs under `@vitest-environment node` (a per-file Vitest pragma) since Next.js Route Handlers are meant to execute in a server runtime, not jsdom — this avoids any DOM/Request/Response ambiguity.
- No real network calls anywhere: the route test mocks `global.fetch`; no test touches NVIDIA NIM or Groq.

---

## Task 1: Shared summarize types + candidate-count policy

**Files:**
- Create: `web/lib/summarize/types.ts`
- Test: `web/__tests__/summarize/types.test.ts`

- [ ] **Step 1: Write the failing test `web/__tests__/summarize/types.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { candidateCount, LENGTH_TARGETS } from "@/lib/summarize/types";

describe("candidateCount", () => {
  it("scales to ~2.5x the target, capped at 40", () => {
    expect(candidateCount(6)).toBe(15);
    expect(candidateCount(10)).toBe(25);
    expect(candidateCount(16)).toBe(40);
  });

  it("never returns fewer than the target itself", () => {
    expect(candidateCount(1)).toBeGreaterThanOrEqual(1);
  });
});

describe("LENGTH_TARGETS", () => {
  it("matches the ML pipeline's length presets", () => {
    expect(LENGTH_TARGETS).toEqual({ short: 6, medium: 10, detailed: 16 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run (from `web/`): `npm run test:run -- __tests__/summarize/types.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/summarize/types"` (module doesn't exist yet).

- [ ] **Step 3: Implement `web/lib/summarize/types.ts`**

```ts
/** Types + small policy constants shared by the client-side (browser) summarize
 * pipeline (segment -> rank -> assemble) and the Next.js `/api/summarize` route
 * that performs the bounded LLM select-and-reword step. */

export interface ExtractedWord {
  text: string;
  bbox: [number, number, number, number];
  page: number;
}

export interface Sentence {
  text: string;
  page: number;
  bboxes: [number, number, number, number][];
}

export interface RankedSentence {
  sentence: Sentence;
  confidence: number; // 0..1, real rank score -- never fabricated
}

/** A candidate as sent to the LLM: only an index + its text. The LLM may
 * reference a selected point back to a candidate ONLY by this index. */
export interface LlmCandidate {
  index: number;
  text: string;
}

/** Target number of summary points per length preset -- mirrors
 * `ml/lucent_ml/settings.py`'s `LENGTH_TARGETS` so both summarization paths
 * agree on what "short/medium/detailed" means. */
export const LENGTH_TARGETS: Record<string, number> = { short: 6, medium: 10, detailed: 16 };

/** How many ranked candidates to offer the LLM for a given target point count:
 * ~2.5x the target so it has real choices to select from, capped at 40 to keep
 * the prompt bounded regardless of document length. */
export function candidateCount(targetCount: number): number {
  return Math.min(40, Math.max(targetCount, Math.round(targetCount * 2.5)));
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- __tests__/summarize/types.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add web/lib/summarize/types.ts web/__tests__/summarize/types.test.ts
git -c commit.gpgsign=false commit -m "feat(web): add shared summarize pipeline types + candidate-count policy"
```

---

## Task 2: Sentence segmentation (`segment.ts`)

**Files:**
- Create: `web/lib/summarize/segment.ts`
- Test: `web/__tests__/summarize/segment.test.ts`

- [ ] **Step 1: Write the failing test `web/__tests__/summarize/segment.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { segmentIntoSentences } from "@/lib/summarize/segment";
import type { ExtractedWord } from "@/lib/summarize/types";

function wordsFromLine(line: string, page: number, y: number): ExtractedWord[] {
  let x = 72;
  const words: ExtractedWord[] = [];
  for (const w of line.split(" ")) {
    const width = w.length * 6;
    words.push({ text: w, bbox: [x, y, x + width, y + 12], page });
    x += width + 4;
  }
  return words;
}

const PAGE1 = [
  "Photosynthesis converts light energy into chemical energy in plants.",
  "Chlorophyll in the chloroplasts absorbs mostly red and blue light.",
  "The light reactions produce ATP and NADPH on the thylakoid membrane.",
];
const PAGE2 = [
  "Cellular respiration releases the energy stored in glucose molecules.",
  "Glycolysis breaks glucose into two pyruvate molecules in the cytoplasm.",
];

function buildWords(): ExtractedWord[] {
  const words: ExtractedWord[] = [];
  let y = 700;
  for (const line of PAGE1) {
    words.push(...wordsFromLine(line, 1, y));
    y -= 24;
  }
  y = 700;
  for (const line of PAGE2) {
    words.push(...wordsFromLine(line, 2, y));
    y -= 24;
  }
  return words;
}

describe("segmentIntoSentences", () => {
  it("produces sentences with geometry on valid pages", () => {
    const sentences = segmentIntoSentences(buildWords());
    expect(sentences.length).toBeGreaterThanOrEqual(5);
    for (const s of sentences) {
      expect([1, 2]).toContain(s.page);
      expect(s.bboxes.length).toBeGreaterThan(0);
      expect(s.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("reconstructs the photosynthesis sentence on page 1", () => {
    const sentences = segmentIntoSentences(buildWords());
    const hit = sentences.find((s) =>
      s.text.toLowerCase().includes("photosynthesis converts light energy"),
    );
    expect(hit).toBeDefined();
    expect(hit!.page).toBe(1);
  });

  it("does not mix words from different pages into one sentence", () => {
    const sentences = segmentIntoSentences(buildWords());
    const p2 = sentences.filter((s) => s.page === 2);
    expect(p2.some((s) => s.text.toLowerCase().includes("glycolysis"))).toBe(true);
    expect(p2.some((s) => s.text.toLowerCase().includes("photosynthesis"))).toBe(false);
  });

  it("returns empty for empty input", () => {
    expect(segmentIntoSentences([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test:run -- __tests__/summarize/segment.test.ts`
Expected: FAIL — `segmentIntoSentences` / module not found.

- [ ] **Step 3: Implement `web/lib/summarize/segment.ts`**

```ts
/** Stage: group extracted PDF words into sentences that carry page + bbox
 * geometry -- the browser-side mirror of `ml/lucent_ml/pipeline/segment.py`.
 *
 * Words are reconstructed into a single string per page (so a sentence never
 * spans two pages), segmented with the browser's built-in `Intl.Segmenter`,
 * and each sentence's character span is mapped back to the words it covers so
 * every sentence keeps real geometry. */
import type { ExtractedWord, Sentence } from "./types";

interface WordSpan {
  start: number;
  end: number;
  word: ExtractedWord;
}

function pageTextAndSpans(words: ExtractedWord[]): { text: string; spans: WordSpan[] } {
  const parts: string[] = [];
  const spans: WordSpan[] = [];
  let cursor = 0;
  for (const w of words) {
    if (parts.length > 0) cursor += 1; // the space separator
    const start = cursor;
    parts.push(w.text);
    cursor += w.text.length;
    spans.push({ start, end: cursor, word: w });
  }
  return { text: parts.join(" "), spans };
}

export function segmentIntoSentences(words: ExtractedWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  const pages = Array.from(new Set(words.map((w) => w.page))).sort((a, b) => a - b);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

  for (const page of pages) {
    const pageWords = words.filter((w) => w.page === page);
    const { text, spans } = pageTextAndSpans(pageWords);
    if (!text.trim()) continue;

    for (const { segment, index } of segmenter.segment(text)) {
      const leadingWs = segment.length - segment.trimStart().length;
      const raw = segment.trim();
      if (!raw) continue;
      const start = index + leadingWs;
      const end = start + raw.length;
      const bboxes = spans
        .filter((s) => s.start < end && s.end > start)
        .map((s) => s.word.bbox);
      if (bboxes.length === 0) continue;
      sentences.push({ text: raw, page, bboxes });
    }
  }
  return sentences;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- __tests__/summarize/segment.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add web/lib/summarize/segment.ts web/__tests__/summarize/segment.test.ts
git -c commit.gpgsign=false commit -m "feat(web): add client-side sentence segmentation (mirrors ml segment.py)"
```

---

## Task 3: Extractive ranking (`rank.ts`)

**Files:**
- Create: `web/lib/summarize/rank.ts`
- Test: `web/__tests__/summarize/rank.test.ts`

- [ ] **Step 1: Write the failing test `web/__tests__/summarize/rank.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rankSentences } from "@/lib/summarize/rank";
import type { Sentence } from "@/lib/summarize/types";

function sentence(text: string, page = 1): Sentence {
  return { text, page, bboxes: [[0, 0, 10, 10]] };
}

describe("rankSentences", () => {
  it("selects top-N with normalized descending scores", () => {
    const sentences = [
      sentence("Photosynthesis converts light energy into chemical energy in plants."),
      sentence("Chlorophyll in the chloroplasts absorbs mostly red and blue light."),
      sentence("The light reactions produce ATP and NADPH on the thylakoid membrane."),
      sentence("The Calvin cycle then fixes carbon dioxide into glucose using that ATP."),
      sentence("Water is split during the light reactions, releasing oxygen as a byproduct."),
    ];
    const ranked = rankSentences(sentences, 3);
    expect(ranked).toHaveLength(3);
    for (const r of ranked) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
    const scores = ranked.map((r) => r.confidence);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const srcTexts = new Set(sentences.map((s) => s.text));
    expect(ranked.every((r) => srcTexts.has(r.sentence.text))).toBe(true);
  });

  it("returns all sentences when topN exceeds corpus size", () => {
    const sentences = [sentence("One sentence here."), sentence("Another one there.")];
    expect(rankSentences(sentences, 999)).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    expect(rankSentences([], 5)).toEqual([]);
  });

  it("does not throw on an all-stopword corpus", () => {
    const sentences = [
      sentence("The and of to a."),
      sentence("Is in on at it."),
      sentence("For with as by an."),
    ];
    const ranked = rankSentences(sentences, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((r) => r.confidence >= 0 && r.confidence <= 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test:run -- __tests__/summarize/rank.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/lib/summarize/rank.ts`**

```ts
/** Stage: extractive ranking of sentences via a small, dependency-free
 * TF-IDF + PageRank-style graph -- the browser-side mirror of
 * `ml/lucent_ml/pipeline/rank.py`. Selected sentences are the ANCHORS: each
 * carries real page + bbox geometry, so any point derived from one is a real
 * citation. A degenerate corpus (e.g. every sentence is only stopwords) falls
 * back to a position prior instead of ever throwing. */
import type { Sentence, RankedSentence } from "./types";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "of", "to", "in",
  "on", "at", "by", "for", "with", "as", "is", "are", "was", "were", "be",
  "been", "being", "it", "its", "this", "that", "these", "those", "i", "you",
  "he", "she", "we", "they", "them", "his", "her", "their", "our", "your",
  "not", "so", "such", "from", "into", "about", "than", "too", "very", "can",
  "will", "just", "do", "does", "did",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, va] of a) {
    normA += va * va;
    const vb = b.get(term);
    if (vb) dot += va * vb;
  }
  for (const vb of b.values()) normB += vb * vb;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tfidfVectors(docs: string[][]): Map<string, number>[] {
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const n = docs.length;
  return docs.map((doc) => {
    const termFreq = new Map<string, number>();
    for (const term of doc) termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    const vector = new Map<string, number>();
    for (const [term, count] of termFreq) {
      const idf = Math.log((n + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;
      vector.set(term, count * idf);
    }
    return vector;
  });
}

function pageRank(similarity: number[][], iterations = 100, damping = 0.85): number[] {
  const n = similarity.length;
  if (n === 0) return [];
  const weights = similarity.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return sum > 0 ? row.map((v) => v / sum) : row.map(() => 1 / n);
  });
  let scores = new Array(n).fill(1 / n);
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Array(n).fill((1 - damping) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        next[j] += damping * scores[i] * weights[i][j];
      }
    }
    scores = next;
  }
  return scores;
}

export function rankSentences(sentences: Sentence[], topN: number): RankedSentence[] {
  if (sentences.length === 0) return [];
  if (sentences.length === 1) {
    return [{ sentence: sentences[0], confidence: 1 }];
  }

  const tokenized = sentences.map((s) => tokenize(s.text));
  const hasVocabulary = tokenized.some((doc) => doc.length > 0);

  let scores: number[];
  if (hasVocabulary) {
    const vectors = tfidfVectors(tokenized);
    const similarity = vectors.map((vi) => vectors.map((vj) => cosineSimilarity(vi, vj)));
    scores = pageRank(similarity);
  } else {
    // Degenerate corpus -- no usable vocabulary. Fall back to a position
    // prior so we still return real anchors instead of throwing.
    scores = sentences.map((_, i) => sentences.length - i);
  }

  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const range = hi - lo || 1;
  const normalized = scores.map((s) => (s - lo) / range);

  const order = sentences.map((_, i) => i).sort((a, b) => normalized[b] - normalized[a]);
  const chosen = order.slice(0, Math.max(0, topN));
  return chosen.map((i) => ({
    sentence: sentences[i],
    confidence: Math.round(normalized[i] * 10000) / 10000,
  }));
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- __tests__/summarize/rank.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add web/lib/summarize/rank.ts web/__tests__/summarize/rank.test.ts
git -c commit.gpgsign=false commit -m "feat(web): add client-side TF-IDF/PageRank sentence ranking (mirrors ml rank.py)"
```

---

## Task 4: Bind LLM output to real candidates (`assemble.ts`)

This is the accuracy-critical task: the file where a candidate index is validated before it can become a citation.

**Files:**
- Create: `web/lib/summarize/assemble.ts`
- Test: `web/__tests__/summarize/assemble.test.ts`

- [ ] **Step 1: Write the failing test `web/__tests__/summarize/assemble.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mergeLineBboxes, bindPointsToCandidates } from "@/lib/summarize/assemble";
import type { RankedSentence } from "@/lib/summarize/types";

function ranked(text: string, page: number, confidence: number): RankedSentence {
  return { sentence: { text, page, bboxes: [[10, 10, 50, 20]] }, confidence };
}

describe("mergeLineBboxes", () => {
  it("merges adjacent boxes on the same line", () => {
    const boxes: [number, number, number, number][] = [
      [72, 700, 100, 712],
      [102, 700.5, 130, 712],
      [132, 700, 160, 712],
    ];
    const merged = mergeLineBboxes(boxes);
    expect(merged).toHaveLength(1);
    const [x0, y0, x1, y1] = merged[0];
    expect(x0).toBe(72);
    expect(x1).toBe(160);
    expect(y0).toBeLessThanOrEqual(700);
    expect(y1).toBeGreaterThanOrEqual(712);
  });

  it("keeps separate lines separate", () => {
    const merged = mergeLineBboxes([
      [72, 700, 100, 712],
      [72, 670, 140, 682],
    ]);
    expect(merged).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    expect(mergeLineBboxes([])).toEqual([]);
  });
});

describe("bindPointsToCandidates", () => {
  const candidates: RankedSentence[] = [
    ranked("First important sentence.", 1, 0.9),
    ranked("Second important sentence.", 1, 0.8),
    ranked("Third important sentence.", 2, 0.6),
  ];

  it("binds a valid index to its own candidate's real geometry and confidence", () => {
    const llmResult = {
      themes: [{ label: "Theme A", points: [{ index: 0, text: "Reworded first point." }] }],
    };
    const { points, themes } = bindPointsToCandidates(llmResult, candidates, 1);
    expect(points).toHaveLength(1);
    expect(points[0].text).toBe("Reworded first point.");
    expect(points[0].anchorSentence).toBe("First important sentence.");
    expect(points[0].page).toBe(1);
    expect(points[0].confidence).toBe(0.9);
    expect(themes).toHaveLength(1);
    expect(themes[0].pointIds).toEqual([points[0].id]);
  });

  it("drops a hallucinated out-of-range index instead of guessing a citation", () => {
    const llmResult = {
      themes: [{ label: "Theme A", points: [{ index: 99, text: "Hallucinated point." }] }],
    };
    const { points } = bindPointsToCandidates(llmResult, candidates, 0);
    expect(points.some((p) => p.text === "Hallucinated point.")).toBe(false);
  });

  it("drops a duplicate index (keeps only the first use)", () => {
    const llmResult = {
      themes: [
        {
          label: "Theme A",
          points: [
            { index: 0, text: "First use." },
            { index: 0, text: "Duplicate use." },
          ],
        },
      ],
    };
    const { points } = bindPointsToCandidates(llmResult, candidates, 0);
    expect(points).toHaveLength(1);
    expect(points[0].text).toBe("First use.");
  });

  it("fills a shortfall from the next-highest-ranked unused candidates, verbatim", () => {
    const llmResult = {
      themes: [{ label: "Theme A", points: [{ index: 0, text: "Reworded." }] }],
    };
    const { points, themes } = bindPointsToCandidates(llmResult, candidates, 3);
    expect(points).toHaveLength(3);
    expect(points[1].text).toBe(points[1].anchorSentence);
    expect(points[2].text).toBe(points[2].anchorSentence);
    expect(themes.some((t) => t.label === "Additional")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test:run -- __tests__/summarize/assemble.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/lib/summarize/assemble.ts`**

```ts
/** Stage: bind an LLM's selection/reword output back to real ranked candidates.
 *
 * The LLM may only reference a candidate by its `index`; this module is the
 * single point where that index is validated before it can become part of a
 * SummaryPoint. A hallucinated or duplicate index is dropped, never guessed
 * or remapped -- the citation-integrity guarantee for the serverless fallback
 * path lives entirely in this file. */
import type { RankedSentence } from "./types";
import type { SummaryPoint, Theme } from "../types";

export type Bbox = [number, number, number, number];

export function mergeLineBboxes(boxes: Bbox[], yTol: number = 4.0): Bbox[] {
  if (boxes.length === 0) return [];
  const sorted = [...boxes].sort((a, b) => {
    const cyA = (a[1] + a[3]) / 2;
    const cyB = (b[1] + b[3]) / 2;
    if (Math.abs(cyA - cyB) <= yTol) return a[0] - b[0];
    return cyA - cyB;
  });
  const lines: Bbox[][] = [];
  for (const b of sorted) {
    const cy = (b[1] + b[3]) / 2;
    let placed = false;
    for (const line of lines) {
      const lcy = (line[0][1] + line[0][3]) / 2;
      if (Math.abs(cy - lcy) <= yTol) {
        line.push(b);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([b]);
  }
  return lines.map((line) => [
    Math.min(...line.map((b) => b[0])),
    Math.min(...line.map((b) => b[1])),
    Math.max(...line.map((b) => b[2])),
    Math.max(...line.map((b) => b[3])),
  ]);
}

export interface LlmPoint {
  index: number;
  text: string;
}
export interface LlmThemeNode {
  label: string;
  points: LlmPoint[];
}
export interface LlmSummarizeResult {
  themes: LlmThemeNode[];
}

export interface AssembledResult {
  points: SummaryPoint[];
  themes: Theme[];
}

/**
 * Bind the LLM's theme/point selection back to real ranked candidates.
 *
 * - A point's `index` must be an integer within `[0, ranked.length)` and not
 *   already used by an earlier point; otherwise it is DROPPED (never
 *   remapped to a different candidate -- that was the original bug).
 * - `anchorSentence`, `page`, `bboxes`, and `confidence` all come from the
 *   real candidate at that index -- never from anything the LLM wrote.
 * - If fewer than `targetCount` valid points result, the shortfall is filled
 *   from the next-highest-ranked UNUSED candidates, verbatim (no reword),
 *   grouped into a synthetic "Additional" theme.
 */
export function bindPointsToCandidates(
  llmResult: LlmSummarizeResult,
  ranked: RankedSentence[],
  targetCount: number,
): AssembledResult {
  const usedIndices = new Set<number>();
  const points: SummaryPoint[] = [];
  const themes: Theme[] = [];
  let pointCounter = 1;

  for (let tIdx = 0; tIdx < (llmResult.themes ?? []).length; tIdx++) {
    const themeNode = llmResult.themes[tIdx];
    const tid = `t${tIdx + 1}`;
    const pointIds: string[] = [];

    for (const pt of themeNode.points ?? []) {
      const idx = pt.index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= ranked.length || usedIndices.has(idx)) {
        continue; // hallucinated or duplicate index -- dropped, never remapped
      }
      usedIndices.add(idx);
      const candidate = ranked[idx];
      const pid = `p${pointCounter++}`;
      pointIds.push(pid);
      points.push({
        id: pid,
        text: pt.text,
        anchorSentence: candidate.sentence.text,
        page: candidate.sentence.page,
        bboxes: mergeLineBboxes(candidate.sentence.bboxes),
        confidence: candidate.confidence,
        themeId: tid,
      });
    }

    if (pointIds.length > 0) {
      themes.push({ id: tid, label: themeNode.label, pointIds });
    }
  }

  if (points.length < targetCount) {
    const fillTid = `t${themes.length + 1}`;
    const fillIds: string[] = [];
    for (let idx = 0; idx < ranked.length && points.length < targetCount; idx++) {
      if (usedIndices.has(idx)) continue;
      usedIndices.add(idx);
      const candidate = ranked[idx];
      const pid = `p${pointCounter++}`;
      fillIds.push(pid);
      points.push({
        id: pid,
        text: candidate.sentence.text, // verbatim -- no reword available for a fallback fill
        anchorSentence: candidate.sentence.text,
        page: candidate.sentence.page,
        bboxes: mergeLineBboxes(candidate.sentence.bboxes),
        confidence: candidate.confidence,
        themeId: fillTid,
      });
    }
    if (fillIds.length > 0) {
      themes.push({ id: fillTid, label: "Additional", pointIds: fillIds });
    }
  }

  return { points, themes };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- __tests__/summarize/assemble.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add web/lib/summarize/assemble.ts web/__tests__/summarize/assemble.test.ts
git -c commit.gpgsign=false commit -m "feat(web): bind LLM selections to real candidates with strict index validation"
```

---

## Task 5: Update the `/api/summarize` route to the bounded-candidate contract

**Files:**
- Modify: `web/app/api/summarize/route.ts` (full replace)
- Test: `web/__tests__/api.route.summarize.test.ts`

- [ ] **Step 1: Write the failing test `web/__tests__/api.route.summarize.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/summarize/route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function llmResponse(themes: unknown) {
  return {
    ok: true,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ themes }) } }] }),
  };
}

const CANDIDATES = [
  { index: 0, text: "First candidate sentence." },
  { index: 1, text: "Second candidate sentence." },
];

beforeEach(() => {
  vi.stubEnv("NVIDIA_API_KEY", "test-nim-key");
  vi.stubEnv("GROQ_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/summarize", () => {
  it("returns 400 for a missing candidates list", async () => {
    const res = await POST(req({ length: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when no API keys are configured", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    const res = await POST(req({ candidates: CANDIDATES, length: "short" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("not-configured");
  });

  it("passes through a fully valid LLM response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        llmResponse([{ label: "Theme A", points: [{ index: 0, text: "Reworded point." }] }]),
      ),
    );
    const res = await POST(req({ candidates: CANDIDATES, length: "short" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.themes[0].points[0].index).toBe(0);
  });

  it("strips a hallucinated out-of-range index before responding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        llmResponse([{ label: "Theme A", points: [{ index: 99, text: "Hallucinated." }] }]),
      ),
    );
    const res = await POST(req({ candidates: CANDIDATES, length: "short" }));
    const body = await res.json();
    expect(body.themes).toEqual([]);
  });

  it("falls back to Groq when NVIDIA NIM fails", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "nim down" })
      .mockResolvedValueOnce(
        llmResponse([{ label: "Theme A", points: [{ index: 1, text: "Via Groq." }] }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ candidates: CANDIDATES, length: "short" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.themes[0].points[0].text).toBe("Via Groq.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test:run -- __tests__/api.route.summarize.test.ts`
Expected: FAIL — the current route expects `{ sentences }`, not `{ candidates }`; the 400/validation/index-stripping behavior doesn't exist yet.

- [ ] **Step 3: Replace `web/app/api/summarize/route.ts` in full**

```ts
import { NextResponse } from "next/server";
import type { LlmThemeNode, LlmSummarizeResult } from "@/lib/summarize/assemble";
import { LENGTH_TARGETS, type LlmCandidate } from "@/lib/summarize/types";

export async function POST(req: Request) {
  try {
    const { candidates, length } = (await req.json()) as {
      candidates: LlmCandidate[];
      length: string;
    };

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json(
        { error: "bad-request", message: "Missing or invalid candidates list" },
        { status: 400 },
      );
    }

    const N = LENGTH_TARGETS[length] ?? LENGTH_TARGETS.medium;

    const systemPrompt = `You are a professional document summarization assistant.
You will be given a numbered list of candidate sentences, already pre-selected from a PDF as the most information-dense sentences in the document. Your job is to pick the best subset, rewrite each into a plain-language point, and group them into themes.
You MUST output your response strictly as a JSON object, with no markdown code blocks, no backticks, and no explanation.

JSON Schema:
{
  "themes": [
    {
      "label": "Name of the theme/topic (1-3 words)",
      "points": [
        { "index": <the exact "index" value of the candidate you selected>, "text": "The concise, plain-language rewritten summary point" }
      ]
    }
  ]
}

Rules:
1. Select exactly ${N} candidates (or all of them if there are fewer than ${N} total).
2. The "index" field in your output MUST be copied EXACTLY from one of the candidates' "index" values below. Do not invent an index, do not use a position/count instead of the given index, and never reuse the same index twice.
3. Rewrite each selected candidate into one clear, concise, plain-language sentence.
4. Group the selected candidates into 2 to 5 themes with short, professional labels.`;

    const userPrompt = `Candidates:
${candidates.map((c) => `[${c.index}] ${c.text}`).join("\n")}

Select ${N} of these candidates, reword them, group into 2-5 themes, and return the JSON.`;

    const providers: { name: string; url: string; key: string; model: string }[] = [];
    if (process.env.NVIDIA_API_KEY) {
      providers.push({
        name: "nvidia-nim",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        key: process.env.NVIDIA_API_KEY,
        model: process.env.LUCENT_NIM_MODEL || "meta/llama-3.3-70b-instruct",
      });
    }
    if (process.env.GROQ_API_KEY) {
      providers.push({
        name: "groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: process.env.GROQ_API_KEY,
        model: process.env.LUCENT_GROQ_MODEL || "llama-3.3-70b-versatile",
      });
    }

    if (providers.length === 0) {
      return NextResponse.json(
        {
          error: "not-configured",
          message: "No LLM API keys (NVIDIA NIM or Groq) are configured on the server.",
        },
        { status: 500 },
      );
    }

    let responseText = "";
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0,
            max_tokens: 2048,
            response_format: { type: "json_object" },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          responseText = text;
          break;
        }
        throw new Error("Empty completion response");
      } catch (e) {
        errors.push(`${provider.name}: ${(e as Error).message}`);
      }
    }

    if (!responseText) {
      return NextResponse.json(
        { error: "api-failed", message: "All chat backends failed: " + errors.join("; ") },
        { status: 502 },
      );
    }

    let parsed: LlmSummarizeResult;
    try {
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start === -1 || end === -1 || end < start) {
        throw new Error("Could not find a valid JSON object in completion response");
      }
      parsed = JSON.parse(responseText.substring(start, end + 1));
    } catch (e) {
      return NextResponse.json(
        {
          error: "bad-json",
          message: "Failed to parse JSON from LLM: " + (e as Error).message,
          raw: responseText,
        },
        { status: 500 },
      );
    }

    // Server-side validation: an out-of-range or duplicate index is DROPPED
    // here too (defense in depth -- the client independently validates again
    // in bindPointsToCandidates before anything becomes a citation).
    const validIndices = new Set(candidates.map((c) => c.index));
    const seen = new Set<number>();
    const cleanedThemes: LlmThemeNode[] = (parsed.themes ?? [])
      .map((theme) => ({
        label: theme.label,
        points: (theme.points ?? []).filter((pt) => {
          if (!Number.isInteger(pt.index) || !validIndices.has(pt.index) || seen.has(pt.index)) {
            return false;
          }
          seen.add(pt.index);
          return true;
        }),
      }))
      .filter((theme) => theme.points.length > 0);

    return NextResponse.json({ themes: cleanedThemes });
  } catch (e) {
    return NextResponse.json(
      { error: "internal", message: "Internal server error: " + (e as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- __tests__/api.route.summarize.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/summarize/route.ts web/__tests__/api.route.summarize.test.ts
git -c commit.gpgsign=false commit -m "feat(web): bound /api/summarize to indexed candidates + server-side index validation"
```

---

## Task 6: Rewire the client-side fallback onto the new pipeline

**Files:**
- Modify: `web/lib/api.ts` (full replace)

- [ ] **Step 1: Check nothing else imports the old inline helpers before replacing**

Run (from repo root): `grep -rn "mergeLineBboxes" web/ --include="*.ts" --include="*.tsx"`
Expected: only `web/lib/api.ts` (about to be replaced) and the new `web/lib/summarize/assemble.ts` (Task 4) — confirms it's safe to delete the copy in `api.ts`.

- [ ] **Step 2: Replace `web/lib/api.ts` in full**

```ts
import type { SummarizeResponse, SummaryLength, PageDim } from "./types";
import { segmentIntoSentences } from "./summarize/segment";
import { rankSentences } from "./summarize/rank";
import { bindPointsToCandidates, type LlmSummarizeResult } from "./summarize/assemble";
import { LENGTH_TARGETS, candidateCount } from "./summarize/types";
import type { ExtractedWord } from "./summarize/types";

const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? "http://localhost:8000";

export async function checkHealth(): Promise<boolean> {
  // 1. Try local Python backend
  try {
    const r = await fetch(`${ML_URL}/healthz`);
    if (r.ok) {
      const body = await r.json();
      if (body.status === "ok") return true;
    }
  } catch {
    // Ignore and try Next.js API fallback
  }

  // 2. Check Next.js server health (API keys)
  return await checkHealthOnlyFallback();
}

async function checkHealthOnlyFallback(): Promise<boolean> {
  try {
    const r = await fetch("/api/health");
    if (r.ok) {
      const body = await r.json();
      return !!body.fallbackEnabled;
    }
  } catch {
    // ignore
  }
  return false;
}

export async function summarize(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  try {
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
  } catch (e) {
    const isNetworkError =
      e instanceof TypeError ||
      (e as Error).message === "Failed to fetch" ||
      (e as Error).message.includes("fetch failed") ||
      (e as Error).message.includes("NetworkError");
    if (isNetworkError) {
      const fallbackAvailable = await checkHealthOnlyFallback();
      if (fallbackAvailable) {
        return await summarizeWithApiFallback(file, length);
      }
    }
    throw e;
  }
}

async function extractWords(file: File): Promise<{ pages: PageDim[]; words: ExtractedWord[] }> {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pages: PageDim[] = [];
  const words: ExtractedWord[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 }); // scale=1.0 maps to standard PDF points
    pages.push({ page: pageNum, width: viewport.width, height: viewport.height });

    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      const text = item.str;
      if (!text.trim()) continue;

      const x0 = item.transform[4];
      const y0 = item.transform[5];
      const x1 = x0 + item.width;
      const y1 = y0 + item.height;

      const [vx0, vy1] = viewport.convertToViewportPoint(x0, y0);
      const [vx1, vy0] = viewport.convertToViewportPoint(x1, y1);

      const wordsInItem = text.split(/\s+/);
      let charOffset = 0;
      for (const word of wordsInItem) {
        if (!word) continue;
        const wordStartIdx = text.indexOf(word, charOffset);
        const wordEndIdx = wordStartIdx + word.length;
        charOffset = wordEndIdx;

        const wx0 = x0 + (wordStartIdx / text.length) * item.width;
        const wx1 = x0 + (wordEndIdx / text.length) * item.width;

        const [wvx0, wvy1] = viewport.convertToViewportPoint(wx0, y0);
        const [wvx1, wvy0] = viewport.convertToViewportPoint(wx1, y1);

        words.push({ text: word, bbox: [wvx0, wvy0, wvx1, wvy1], page: pageNum });
      }
    }
  }

  return { pages, words };
}

async function summarizeWithApiFallback(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  const startTime = Date.now();

  const { pages, words } = await extractWords(file);
  const sentences = segmentIntoSentences(words);

  if (sentences.length === 0) {
    throw new Error("No text found in the PDF. Scanned PDFs are not supported.");
  }

  const N = LENGTH_TARGETS[length] ?? LENGTH_TARGETS.medium;
  const K = candidateCount(N);
  const ranked = rankSentences(sentences, K);
  const candidates = ranked.map((r, i) => ({ index: i, text: r.sentence.text }));

  const response = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, length }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
    throw new Error(errorBody.message ?? "Summarization failed");
  }

  const llmResult = (await response.json()) as LlmSummarizeResult;
  const { points, themes } = bindPointsToCandidates(llmResult, ranked, N);

  return {
    docId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    filename: file.name,
    pageCount: pages.length,
    pages,
    points,
    themes,
    timings: { totalMs: Date.now() - startTime },
  };
}
```

- [ ] **Step 3: Run the full web suite to confirm no regressions**

Run: `npm run test:run`
Expected: all test files pass — the pre-existing `api.summarize.test.ts` (tests `summarize()`'s ML-backend path, unaffected since it never reaches `summarizeWithApiFallback`) plus everything from Tasks 1-5.

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/lib/api.ts
git -c commit.gpgsign=false commit -m "fix(web): rewire serverless summarize fallback onto ranked-candidate pipeline"
```

---

## Task 7: Bump reword models to Llama 3.3 70B (both paths, in lockstep)

**Files:**
- Modify: `ml/lucent_ml/settings.py:29,32`
- Modify: `ml/.env.example`

- [ ] **Step 1: Update `ml/lucent_ml/settings.py`**

Change line 29 from:
```python
    NIM_MODEL: str = os.environ.get("LUCENT_NIM_MODEL", "meta/llama-3.1-8b-instruct")
```
to:
```python
    NIM_MODEL: str = os.environ.get("LUCENT_NIM_MODEL", "meta/llama-3.3-70b-instruct")
```

Change line 32 from:
```python
    GROQ_MODEL: str = os.environ.get("LUCENT_GROQ_MODEL", "llama-3.1-8b-instant")
```
to:
```python
    GROQ_MODEL: str = os.environ.get("LUCENT_GROQ_MODEL", "llama-3.3-70b-versatile")
```

- [ ] **Step 2: Update `ml/.env.example`** — change the commented default lines to match:

```
# LUCENT_NIM_MODEL=meta/llama-3.3-70b-instruct
```
```
# LUCENT_GROQ_MODEL=llama-3.3-70b-versatile
```

- [ ] **Step 3: Confirm no Python test hardcodes the old defaults**

Run (from repo root): `grep -rn "llama-3.1-8b" ml/`
Expected: no matches (the only prior hits were the two `settings.py` lines just changed; `ml/tests/test_api_provider.py` constructs its own `ChatBackend` fixtures with explicit model strings that don't read from `settings.py`, so it is unaffected).

- [ ] **Step 4: Run the ML fast suite to confirm no regressions**

Run (from `ml/`): `.venv/Scripts/python.exe -m pytest -m "not slow" -q`
Expected: same pass count as before this change (this is a default-value change only, no logic touched).

- [ ] **Step 5: Commit**

```bash
git add ml/lucent_ml/settings.py ml/.env.example
git -c commit.gpgsign=false commit -m "chore(ml): bump default reword models to Llama 3.3 70B (NIM + Groq)"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full web suite + tsc**

```bash
cd web && npm run test:run && npx tsc --noEmit
```
Expected: all green (api, api.summarize, SummaryCard, geometry, BeamOverlay, themeGroup, healthGate, summarize/types, summarize/segment, summarize/rank, summarize/assemble, api.route.summarize — 16 pre-existing + this plan's new tests); tsc clean.

- [ ] **Step 2: Run the full ML fast suite**

```bash
cd ml && .venv/Scripts/python.exe -m pytest -m "not slow" -q
```
Expected: same green count as before this plan (no ML logic changed, only two model-name defaults).

- [ ] **Step 3: Manual smoke (requires at least one of NVIDIA_API_KEY / GROQ_API_KEY set in `web/.env.local` or the shell)**

```bash
cd web && npm run dev
```
Stop the Python ML service (or don't start it) so `/healthz` fails and the serverless fallback engages. Upload `ml/tests/fixtures/sample-2page.pdf`. Confirm: the summary points read as genuinely relevant/accurate sentences (not arbitrary picks), each point's confidence bar reflects a real rank score (not a flat descending 0.95/0.93/0.91... pattern), and clicking a point still draws a correct beam to its cited region.

- [ ] **Step 4: Confirm the working tree is clean and review the commit sequence**

```bash
git status --short
git log --oneline -8
```
Expected: clean tree; 7 commits from this plan (Tasks 1-7) on top of prior history.

---

## Self-Review

**Spec coverage** against `docs/superpowers/specs/2026-07-02-lucent-api-summarize-accuracy-design.md`:

| Spec section | Task(s) |
|---|---|
| §2 Architecture (segment -> rank -> candidates -> LLM -> validate -> bind) | T1-T6 |
| §3 New modules: types/segment/rank/assemble | T1, T2, T3, T4 |
| §3 Route contract change (candidates, JSON mode, model bump) | T5 |
| §3 `lib/api.ts` rewrite | T6 |
| §3 Model bump, both paths in lockstep | T5 (web), T7 (ml) |
| §4 Failure ladder (drop invalid, shortfall fill, verbatim, existing error codes) | T4 (drop + fill logic), T5 (server-side strip + unchanged error codes) |
| §5 Testing strategy (segment/rank/assemble/route tests, no regressions) | T1-T6 each add their test; T6 Step 3 + T8 Step 1 confirm no regressions |
| §6 Non-goals (no ML pipeline algorithm change, no HTTP contract change to `ml/`, no new UI, no heavy dependency) | Respected throughout — T7 only touches two string constants; no task touches `ml/lucent_ml/pipeline/`; no task touches `SummaryCard`/`ThemeGroup`/`BeamOverlay`; `rank.ts` is dependency-free |

**Placeholder scan:** no TBD/TODO/"implement later" in any step; every step has complete, runnable code.

**Type consistency:** `RankedSentence`, `Sentence`, `ExtractedWord`, `LlmCandidate` (T1) are the exact names imported and used in T2 (`segmentIntoSentences(words: ExtractedWord[]): Sentence[]`), T3 (`rankSentences(sentences: Sentence[], topN: number): RankedSentence[]`), and T4 (`bindPointsToCandidates(llmResult: LlmSummarizeResult, ranked: RankedSentence[], targetCount: number): AssembledResult`). T5's route imports `LlmThemeNode`/`LlmSummarizeResult` from T4's `assemble.ts` and `LENGTH_TARGETS`/`LlmCandidate` from T1's `types.ts`, so the route's output shape and the client's expected input shape (T6) are the same type, not independently redefined. T6 imports the exact same four functions/constants from T1-T4 with matching signatures. `candidateCount` (T1) is used identically in T6.

**Known acceptable scope note:** theme grouping in the serverless path remains LLM-driven (not embedding/KMeans-based like the Python path) — this is explicitly called out as a non-goal in the design spec (§6/§7), not an oversight.
