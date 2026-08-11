"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppShell, type View } from "@/components/AppShell";
import { HomeView } from "@/components/HomeView";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { SummaryPanel } from "@/components/SummaryPanel";
import { BeamOverlay } from "@/components/BeamOverlay";
import { useActiveEls } from "@/lib/useBeams";
import { summarize, checkHealth } from "@/lib/api";
import { toMarkdown, download } from "@/lib/export";
import {
  clearRecent, deleteRecent, getRecent, listRecent, saveRecent, type RecentDocMeta,
} from "@/lib/recentDocs";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

// react-pdf (pdf.js) touches browser-only APIs (DOMMatrix) at module load, so it
// must not be evaluated during server prerender. Load it client-side only.
const PdfCanvas = dynamic(() => import("@/components/PdfCanvas").then((m) => m.PdfCanvas), {
  ssr: false,
});

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [length, setLength] = useState<SummaryLength>("medium");
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [recents, setRecents] = useState<RecentDocMeta[]>([]);
  const [copied, setCopied] = useState(false);

  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const highlightRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { card, hi } = useActiveEls(activeId, cardRefs, highlightRefs);

  useEffect(() => {
    let alive = true;
    checkHealth().then((ok) => { if (alive) setHealth(ok ? "ok" : "down"); });
    listRecent().then((r) => { if (alive) setRecents(r); });
    return () => { alive = false; };
  }, []);

  const activate = useCallback((id: string) => {
    setActiveId(id);
    requestAnimationFrame(() =>
      highlightRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, []);

  // Keyboard: ↑/↓ (or j/k) walk the points, Esc clears the active beam.
  useEffect(() => {
    if (view !== "workspace" || !result) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const ids = result!.points.map((p) => p.id);
      if (!ids.length) return;
      const i = activeId ? ids.indexOf(activeId) : -1;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); activate(ids[(i + 1) % ids.length]); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); activate(ids[(i - 1 + ids.length) % ids.length]); }
      else if (e.key === "Escape") setActiveId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, result, activeId, activate]);

  async function run(f: File, l: SummaryLength = length) {
    setFile(f); setLoading(true); setError(null); setActiveId(null);
    try {
      const res = await summarize(f, l);
      setResult(res);
      setView("workspace");
      saveRecent(f, res).then(() => listRecent().then(setRecents));
    } catch (e) {
      setError((e as Error).message);
      if (!result) setView("home");
    } finally {
      setLoading(false);
    }
  }

  async function changeLength(l: SummaryLength) {
    setLength(l);
    setError(null);
    if (file) await run(file, l);
  }

  async function openRecent(docId: string) {
    const doc = await getRecent(docId);
    if (!doc) return;
    setFile(new File([doc.pdfBlob], doc.filename, { type: "application/pdf" }));
    setResult(doc.summary);
    setActiveId(null);
    setView("workspace");
  }

  function copyMarkdown() {
    if (!result) return;
    navigator.clipboard?.writeText(toMarkdown(result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const workspace = view === "workspace" && result;

  return (
    <AppShell
      view={view}
      onNavigate={(v) => {
        setView(v);
        setActiveId(null);
        listRecent().then(setRecents);
      }}
    >
      {workspace ? (
        <>
          <WorkspaceHeader
            result={result} length={length} loading={loading}
            onLengthChange={changeLength}
            onHome={() => { setView("home"); setActiveId(null); }}
            onDownloadJson={() =>
              download(
                `${result.filename.replace(/\.pdf$/i, "")}-summary.json`,
                JSON.stringify(result, null, 2),
                "application/json",
              )}
            onCopyMarkdown={copyMarkdown}
            copied={copied}
          />
          {error && (
            <p role="alert" className="border-b border-[var(--border)] px-4 py-2 text-sm text-red-500">
              {error}
            </p>
          )}
          <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[62%_38%]">
            {file && (
              <PdfCanvas
                file={file} pages={result.pages} points={result.points} activeId={activeId}
                onActivate={activate}
                registerHighlight={(id, el) => {
                  if (el) highlightRefs.current.set(id, el);
                  else highlightRefs.current.delete(id);
                }}
              />
            )}
            <SummaryPanel result={result} activeId={activeId} onActivate={activate} cardRefs={cardRefs} />
          </main>
          <BeamOverlay activeId={activeId} cardEl={card} highlightEl={hi} />
        </>
      ) : (
        <HomeView
          mode={view === "library" ? "library" : "home"}
          health={health} loading={loading} loadingName={file?.name} error={error}
          length={length} onLengthChange={setLength}
          recents={recents}
          onFile={(f) => run(f)}
          onOpen={openRecent}
          onDelete={(id) => deleteRecent(id).then(() => listRecent().then(setRecents))}
          onClear={() => clearRecent().then(() => setRecents([]))}
        />
      )}
    </AppShell>
  );
}
