"use client";
import { useLayoutEffect, useState } from "react";
import { beamPath, type Rect } from "@/lib/geometry";

interface Props {
  activeId: string | null;
  cardEl: HTMLElement | null;
  highlightEl: HTMLElement | null;
}

function toRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export function BeamOverlay({ activeId, cardEl, highlightEl }: Props) {
  const [d, setD] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!activeId || !cardEl || !highlightEl) { setD(null); return; }

    let raf = 0;
    const recompute = () => {
      raf = requestAnimationFrame(() => setD(beamPath(toRect(cardEl), toRect(highlightEl))));
    };
    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(cardEl); ro.observe(highlightEl);
    window.addEventListener("scroll", recompute, true);   // capture: catch panel scrolls
    window.addEventListener("resize", recompute);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [activeId, cardEl, highlightEl]);

  if (!d) return null;
  return (
    <svg className="pointer-events-none fixed inset-0 w-screen h-screen z-50" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeOpacity={0.8} />
    </svg>
  );
}
