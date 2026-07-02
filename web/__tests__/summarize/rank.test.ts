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
