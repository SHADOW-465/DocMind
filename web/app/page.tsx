"use client";
import { useRef, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { PdfCanvas } from "@/components/PdfCanvas";
import { SummaryPanel } from "@/components/SummaryPanel";
import { BeamOverlay } from "@/components/BeamOverlay";
import { useActiveEls } from "@/lib/useBeams";
import { summarize } from "@/lib/api";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [length, setLength] = useState<SummaryLength>("medium");

  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const highlightRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { card, hi } = useActiveEls(activeId, cardRefs, highlightRefs);

  async function run(f: File) {
    setFile(f); setLoading(true); setError(null);
    try { setResult(await summarize(f, length)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.filename.replace(/\.pdf$/i, "")}-summary.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function changeLength(l: SummaryLength) {
    setLength(l);
    if (file) { setLoading(true); try { setResult(await summarize(file, l)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  }

  if (!result) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Lucent</h1>
        {loading ? <p className="text-[var(--muted)]">Summarizing {file?.name}…</p>
          : <UploadZone onFile={run} disabled={loading} />}
        {error && <p className="text-red-600 mt-4">{error}</p>}
      </main>
    );
  }

  return (
    <main className="h-screen grid grid-cols-[60%_40%]">
      {file && (
        <PdfCanvas
          file={file} pages={result.pages} points={result.points} activeId={activeId}
          registerHighlight={(id, el) => { if (el) highlightRefs.current.set(id, el); else highlightRefs.current.delete(id); }}
        />
      )}
      <SummaryPanel result={result} activeId={activeId}
        onActivate={(id) => {
          setActiveId(id);
          requestAnimationFrame(() => highlightRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }}
        cardRefs={cardRefs} length={length} onLengthChange={changeLength} onDownload={downloadJson} />
      <BeamOverlay activeId={activeId} cardEl={card} highlightEl={hi} />
    </main>
  );
}
