"use client";
import { forwardRef } from "react";
import type { SummaryPoint } from "@/lib/types";

interface Props { point: SummaryPoint; active: boolean; onActivate: (id: string) => void; }

export const SummaryCard = forwardRef<HTMLButtonElement, Props>(function SummaryCard(
  { point, active, onActivate }, ref,
) {
  return (
    <button
      ref={ref}
      onClick={() => onActivate(point.id)}
      data-point-id={point.id}
      className={`w-full text-left rounded-xl border p-4 mb-3 transition bg-[var(--card)]
        ${active ? "border-[var(--accent)] shadow-md" : "border-gray-200 hover:border-gray-300"}`}
    >
      <p className="text-sm leading-relaxed">{point.text}</p>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-[var(--muted)]">p. {point.page}</span>
        <div className="h-1.5 flex-1 bg-gray-100 rounded">
          <div data-testid="confidence-bar" className="h-1.5 rounded bg-[var(--accent)]"
            style={{ width: `${Math.round(point.confidence * 100)}%` }} />
        </div>
      </div>
      {active && (
        <p className="mt-3 text-xs text-[var(--muted)] italic border-l-2 border-gray-200 pl-2">
          {point.anchorSentence}
        </p>
      )}
    </button>
  );
});
