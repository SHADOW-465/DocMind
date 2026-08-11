"use client";
import { useLayoutEffect, useRef, useState } from "react";
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
  const pathRef = useRef<SVGPathElement>(null);

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

  // Draw-in: dash the path to its own length so the stroke animates along it.
  // getTotalLength is unavailable in jsdom, hence the guard.
  useLayoutEffect(() => {
    const p = pathRef.current;
    if (!p || typeof p.getTotalLength !== "function") return;
    const len = p.getTotalLength();
    p.style.setProperty("--beam-len", String(len));
    p.style.strokeDasharray = String(len);
  }, [d]);

  if (!d) return null;
  const [, sx, sy] = /^M ([\d.-]+) ([\d.-]+)/.exec(d) ?? [];
  const end = /([\d.-]+) ([\d.-]+)$/.exec(d);

  return (
    <svg className="pointer-events-none fixed inset-0 z-50 h-screen w-screen" aria-hidden>
      <defs>
        <linearGradient id="beam-grad" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path
        ref={pathRef}
        key={d.slice(0, 24)}
        className="beam-path"
        d={d}
        fill="none"
        stroke="url(#beam-grad)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {sx && <circle cx={sx} cy={sy} r={3.5} fill="var(--accent)" style={{ filter: "var(--glow)" }} />}
      {end && <circle cx={end[1]} cy={end[2]} r={3.5} fill="var(--accent-2)" style={{ filter: "var(--glow)" }} />}
    </svg>
  );
}
