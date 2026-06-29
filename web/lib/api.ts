import type { SummarizeResponse, SummaryLength } from "./types";

const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? "http://localhost:8000";

export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${ML_URL}/healthz`);
    if (!r.ok) return false;
    const body = await r.json();
    return body.status === "ok";
  } catch {
    return false;
  }
}

export async function summarize(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("length", length);
  fd.append("group", "true");
  const r = await fetch(`${ML_URL}/summarize`, { method: "POST", body: fd });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ message: `request failed (${r.status})` }));
    throw new Error(body.message ?? "summarization failed");
  }
  return (await r.json()) as SummarizeResponse;
}
