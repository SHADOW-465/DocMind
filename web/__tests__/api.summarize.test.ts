import { describe, it, expect, vi, beforeEach } from "vitest";
import { summarize } from "@/lib/api";

beforeEach(() => vi.restoreAllMocks());

describe("summarize", () => {
  it("posts multipart and returns parsed response", async () => {
    const fake = { docId: "d", filename: "a.pdf", pageCount: 1, pages: [], points: [], themes: [], timings: {} };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fake });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2])], "a.pdf", { type: "application/pdf" });
    const res = await summarize(file, "short");
    expect(res.docId).toBe("d");
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.body instanceof FormData).toBe(true);
  });

  it("throws with server error message on 422", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ error: "scanned", message: "no text" }),
    }));
    const file = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    await expect(summarize(file, "medium")).rejects.toThrow(/no text/);
  });
});
