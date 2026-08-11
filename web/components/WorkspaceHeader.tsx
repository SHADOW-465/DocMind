"use client";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

const LENGTHS: SummaryLength[] = ["short", "medium", "detailed"];

export function WorkspaceHeader({
  result,
  length,
  loading,
  onLengthChange,
  onHome,
  onDownloadJson,
  onCopyMarkdown,
  copied,
}: {
  result: SummarizeResponse;
  length: SummaryLength;
  loading: boolean;
  onLengthChange: (l: SummaryLength) => void;
  onHome: () => void;
  onDownloadJson: () => void;
  onCopyMarkdown: () => void;
  copied: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4">
      <button
        onClick={onHome}
        className="rounded-full px-2 py-1 text-sm text-[var(--muted)] transition hover:text-[var(--ink)]"
      >
        ← Home
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={result.filename}>
          {result.filename}
        </p>
      </div>
      <span className="mono shrink-0 text-[11px] text-[var(--muted)]">
        {result.pageCount} pp · {result.points.length} points
        {typeof result.timings?.totalMs === "number" && ` · ${(result.timings.totalMs / 1000).toFixed(1)}s`}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {loading && (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
            aria-label="Re-summarizing"
          />
        )}
        <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
          {LENGTHS.map((l) => (
            <button
              key={l}
              onClick={() => onLengthChange(l)}
              aria-pressed={length === l}
              disabled={loading}
              className={`rounded-full px-2.5 py-1 text-xs capitalize transition ${
                length === l
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={onCopyMarkdown}
          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          {copied ? "Copied ✓" : "Copy Markdown"}
        </button>
        <button
          onClick={onDownloadJson}
          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          JSON
        </button>
      </div>
    </header>
  );
}
