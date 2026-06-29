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
