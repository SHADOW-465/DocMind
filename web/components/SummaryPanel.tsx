"use client";
import { useMemo, useState } from "react";
import { ThemeGroup } from "./ThemeGroup";
import type { SummarizeResponse } from "@/lib/types";

interface Props {
  result: SummarizeResponse;
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export function SummaryPanel({ result, activeId, onActivate, cardRefs }: Props) {
  const [query, setQuery] = useState("");

  const points = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return result.points;
    return result.points.filter(
      (p) => p.text.toLowerCase().includes(q) || p.anchorSentence.toLowerCase().includes(q),
    );
  }, [result.points, query]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="shrink-0 border-b border-[var(--border)] p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter points…"
          aria-label="Filter summary points"
          className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {result.points.length === 0 && (
          <p className="px-1 text-sm text-[var(--muted)]">
            No summary points — the document may have too little extractable text.
          </p>
        )}
        {result.points.length > 0 && points.length === 0 && (
          <p className="px-1 text-sm text-[var(--muted)]">No points match “{query}”.</p>
        )}
        {result.themes.map((t) => (
          <ThemeGroup
            key={t.id}
            theme={t}
            points={points}
            activeId={activeId}
            onActivate={onActivate}
            cardRefs={cardRefs}
          />
        ))}
        <p className="mono px-1 pb-2 pt-1 text-[11px] leading-relaxed text-[var(--muted)]">
          ↑/↓ move · Esc clears · click a point to beam it to its source
        </p>
      </div>
    </div>
  );
}
