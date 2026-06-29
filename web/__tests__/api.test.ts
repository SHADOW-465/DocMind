import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkHealth } from "@/lib/api";

beforeEach(() => { vi.restoreAllMocks(); });

describe("checkHealth", () => {
  it("returns true when service reports ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: "ok", modelsLoaded: true }),
    }));
    expect(await checkHealth()).toBe(true);
  });

  it("returns false when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await checkHealth()).toBe(false);
  });
});
