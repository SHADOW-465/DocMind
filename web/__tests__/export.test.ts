import { describe, it, expect } from "vitest";
import { toMarkdown } from "@/lib/export";
import type { SummarizeResponse } from "@/lib/types";

const res: SummarizeResponse = {
  docId: "d1", filename: "report.pdf", pageCount: 2,
  pages: [{ page: 1, width: 612, height: 792 }],
  points: [
    { id: "p1", text: "Costs fell.", anchorSentence: "Total costs fell 12% YoY.", page: 4, bboxes: [[0, 0, 1, 1]], confidence: 0.8, themeId: "t1" },
    { id: "p2", text: "Orphan.", anchorSentence: "Unused.", page: 5, bboxes: [], confidence: 0.2, themeId: "tX" },
  ],
  themes: [
    { id: "t1", label: "Finance", pointIds: ["p1"] },
    { id: "t2", label: "Empty", pointIds: [] },
  ],
  timings: { totalMs: 1000 },
};

describe("toMarkdown", () => {
  it("emits each point with its page citation and verbatim anchor", () => {
    const md = toMarkdown(res);
    expect(md).toContain("# report.pdf");
    expect(md).toContain("## Finance");
    expect(md).toContain("- Costs fell. _(p. 4)_");
    expect(md).toContain("  > Total costs fell 12% YoY.");
  });

  it("skips themes with no points and points with no theme", () => {
    const md = toMarkdown(res);
    expect(md).not.toContain("## Empty");
    expect(md).not.toContain("Orphan.");
  });
});
