"use client";
import { forwardRef } from "react";
import type { SummaryPoint } from "@/lib/types";

interface Props {
  point: SummaryPoint;
  active: boolean;
  dimmed?: boolean;
  onActivate: (id: string) => void;
}

export const SummaryCard = forwardRef<HTMLButtonElement, Props>(function SummaryCard(
  { point, active, dimmed, onActivate }, ref,
) {
  const pct = Math.round(point.confidence * 100);
  return (
    <button
      ref={ref}
      onClick={() => onActivate(point.id)}
      data-point-id={point.id}
      aria-pressed={active}
      aria-label={`${point.text} — linked to source, page ${point.page}`}
      className={`lift mb-3 w-full rounded-[var(--radius)] border p-4 text-left ${
        active
          ? "grad-border bg-[var(--card)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
      } ${dimmed ? "opacity-45" : ""}`}
      style={{ boxShadow: active ? "var(--shadow-lift)" : undefined }}
    >
      <p className="text-sm leading-relaxed">{point.text}</p>

      <div className="mt-3 flex items-center gap-2">
        <span className="mono shrink-0 text-[11px] text-[var(--muted)]">p.{point.page}</span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
          title={`Rank confidence ${pct}%`}
        >
          <div
            data-testid="confidence-bar"
            className="bar-fill h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--grad)" }}
          />
        </div>
        <span className="mono shrink-0 text-[11px] text-[var(--muted)]">{pct}%</span>
      </div>

      {active && (
        <p className="fade-up mt-3 border-l-2 pl-3 text-xs italic leading-relaxed text-[var(--muted)]"
           style={{ borderColor: "var(--accent)" }}>
          {point.anchorSentence}
        </p>
      )}
    </button>
  );
});
