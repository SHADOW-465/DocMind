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
      <header className="flex items-center gap-2 mb-2 px-1">
        <h2 className="text-sm font-semibold text-[var(--ink)]">{theme.label}</h2>
        <span className="text-xs text-[var(--muted)] bg-gray-100 rounded-full px-2 py-0.5">{themePoints.length}</span>
      </header>
      {themePoints.map((p) => (
        <SummaryCard key={p.id} point={p} active={activeId === p.id} onActivate={onActivate}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }} />
      ))}
    </section>
  );
}
