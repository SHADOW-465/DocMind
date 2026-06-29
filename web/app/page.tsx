"use client";
import { useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { summarize } from "@/lib/api";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [length] = useState<SummaryLength>("medium");

  async function run(f: File) {
    setFile(f); setLoading(true); setError(null);
    try { setResult(await summarize(f, length)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold mb-6">Lucent</h1>
      {!result && !loading && <UploadZone onFile={run} disabled={loading} />}
      {loading && <p className="text-[var(--muted)]">Summarizing {file?.name}…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {result && <pre className="text-xs overflow-auto">{JSON.stringify(result.points.map(p => p.text), null, 2)}</pre>}
    </main>
  );
}
