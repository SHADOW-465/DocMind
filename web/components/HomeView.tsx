"use client";
import { UploadZone } from "./UploadZone";
import { RecentDocCard } from "./RecentDocCard";
import type { RecentDocMeta } from "@/lib/recentDocs";
import type { SummaryLength } from "@/lib/types";

interface Props {
  mode: "home" | "library";
  health: "checking" | "ok" | "down";
  loading: boolean;
  loadingName?: string;
  error: string | null;
  length: SummaryLength;
  onLengthChange: (l: SummaryLength) => void;
  recents: RecentDocMeta[];
  onFile: (f: File) => void;
  onOpen: (docId: string) => void;
  onDelete: (docId: string) => void;
  onClear: () => void;
}

const LENGTHS: { id: SummaryLength; label: string; hint: string }[] = [
  { id: "short", label: "Short", hint: "~6 points" },
  { id: "medium", label: "Medium", hint: "~10 points" },
  { id: "detailed", label: "Detailed", hint: "~16 points" },
];

export function HomeView({
  mode,
  health,
  loading,
  loadingName,
  error,
  length,
  onLengthChange,
  recents,
  onFile,
  onOpen,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-8 py-10">
        {mode === "home" ? (
          <>
            <header className="mb-8">
              <h1 className="text-3xl font-semibold tracking-tight">
                Summaries you can <span className="grad-text">check</span>.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
                Drop in a PDF. Every point Lucent writes stays wired to the exact sentence it came
                from — click one and a beam draws to that region on the page. No point can cite a
                source that doesn&apos;t exist.
              </p>
            </header>

            {health === "down" && (
              <div className="mb-5 rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
                Summarization service offline — uploads will fail until a backend is reachable. Start
                it with <code className="mono">uvicorn lucent_ml.app:app --port 8000</code>, or set{" "}
                <code className="mono">NEXT_PUBLIC_ML_URL</code> / an LLM API key, then reload.
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--muted)]">Summary length</span>
              <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
                {LENGTHS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onLengthChange(l.id)}
                    aria-pressed={length === l.id}
                    title={l.hint}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      length === l.id
                        ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div aria-live="polite">
              {loading ? (
                <div className="panel flex items-center gap-3 p-8" style={{ boxShadow: "var(--shadow)" }}>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
                    aria-hidden
                  />
                  <span className="text-sm text-[var(--muted)]">
                    Reading, ranking and rewording {loadingName}…
                  </span>
                </div>
              ) : (
                <UploadZone onFile={onFile} disabled={loading} compact={recents.length > 0} />
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-500">
                {error}
              </p>
            )}
          </>
        ) : (
          <header className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Stored in this browser only — never uploaded anywhere.
              </p>
            </div>
            {recents.length > 0 && (
              <button
                onClick={onClear}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--ink)]"
              >
                Clear all
              </button>
            )}
          </header>
        )}

        {recents.length > 0 && (
          <section className="mt-10">
            {mode === "home" && (
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Recent
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(mode === "home" ? recents.slice(0, 6) : recents).map((d) => (
                <RecentDocCard key={d.docId} doc={d} onOpen={onOpen} onDelete={onDelete} />
              ))}
            </div>
          </section>
        )}

        {mode === "library" && recents.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Nothing here yet — summarize a PDF and it will show up.
          </p>
        )}
      </div>
    </div>
  );
}
