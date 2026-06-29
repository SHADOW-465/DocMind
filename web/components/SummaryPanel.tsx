"use client";
import { ThemeGroup } from "./ThemeGroup";
import type { SummarizeResponse, SummaryLength } from "@/lib/types";

interface Props {
  result: SummarizeResponse;
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  length: SummaryLength;
  onLengthChange: (l: SummaryLength) => void;
  onDownload: () => void;
}

export function SummaryPanel({ result, activeId, onActivate, cardRefs, length, onLengthChange, onDownload }: Props) {
  return (
    <div className="overflow-y-auto h-full p-4 border-l border-gray-200">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-[var(--surface)] py-2">
        <select value={length} onChange={(e) => onLengthChange(e.target.value as SummaryLength)}
          className="text-sm border rounded-lg px-2 py-1">
          <option value="short">Short</option>
          <option value="medium">Medium</option>
          <option value="detailed">Detailed</option>
        </select>
        <button onClick={onDownload} className="text-sm text-[var(--accent)] hover:underline">
          Download JSON
        </button>
      </div>
      {result.points.length === 0 && <p className="text-sm text-[var(--muted)] px-1">No summary points.</p>}
      {result.themes.map((t) => (
        <ThemeGroup key={t.id} theme={t} points={result.points} activeId={activeId}
          onActivate={onActivate} cardRefs={cardRefs} />
      ))}
    </div>
  );
}
