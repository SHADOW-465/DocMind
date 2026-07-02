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
