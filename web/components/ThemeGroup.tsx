"use client";
import { SummaryCard } from "./SummaryCard";
import type { SummaryPoint, Theme } from "@/lib/types";

interface Props {
  theme: Theme;
  points: SummaryPoint[];
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export function ThemeGroup({ theme, points, activeId, onActivate, cardRefs }: Props) {
  const themePoints = points.filter((p) => theme.pointIds.includes(p.id));
  if (themePoints.length === 0) return null;
  return (
    <section className="mb-6">
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--grad)" }} aria-hidden />
        <h2 className="text-sm font-semibold">{theme.label}</h2>
        <span className="mono rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          {themePoints.length}
        </span>
      </header>
      {themePoints.map((p) => (
        <SummaryCard
          key={p.id}
          point={p}
          active={activeId === p.id}
          dimmed={activeId !== null && activeId !== p.id}
          onActivate={onActivate}
          ref={(el) => {
            if (el) cardRefs.current.set(p.id, el);
            else cardRefs.current.delete(p.id);
          }}
        />
      ))}
    </section>
  );
}
