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
