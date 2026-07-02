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
