"use client";
import { SummaryCard } from "./SummaryCard";
import type { SummaryPoint } from "@/lib/types";

interface Props {
  points: SummaryPoint[];
  activeId: string | null;
  onActivate: (id: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export function SummaryPanel({ points, activeId, onActivate, cardRefs }: Props) {
  return (
    <div className="overflow-y-auto h-full p-4">
      {points.map((p) => (
        <SummaryCard
          key={p.id}
          point={p}
          active={activeId === p.id}
          onActivate={onActivate}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }}
        />
      ))}
    </div>
  );
}
