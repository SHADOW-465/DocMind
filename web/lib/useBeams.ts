"use client";
import { useEffect, useState } from "react";

export function useActiveEls(
  activeId: string | null,
  cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>,
  highlightRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
) {
  const [els, setEls] = useState<{ card: HTMLElement | null; hi: HTMLElement | null }>({ card: null, hi: null });
  useEffect(() => {
    if (!activeId) { setEls({ card: null, hi: null }); return; }
    // highlight may mount a tick after the page scrolls into view
    const id = requestAnimationFrame(() =>
      setEls({ card: cardRefs.current.get(activeId) ?? null, hi: highlightRefs.current.get(activeId) ?? null }));
    return () => cancelAnimationFrame(id);
  }, [activeId, cardRefs, highlightRefs]);
  return els;
}
