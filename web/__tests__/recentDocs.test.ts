import { describe, it, expect } from "vitest";
import { evictIds, MAX_RECENT } from "@/lib/recentDocs";

const docs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ docId: `d${i}`, addedAt: i })); // higher i = newer

describe("evictIds", () => {
  it("keeps everything under the cap", () => {
    expect(evictIds(docs(MAX_RECENT))).toEqual([]);
  });

  it("drops the oldest past the cap", () => {
    const stale = evictIds(docs(MAX_RECENT + 3));
    expect(stale).toEqual(["d2", "d1", "d0"]);
  });
});
