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
