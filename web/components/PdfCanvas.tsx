"use client";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { SummaryPoint, PageDim } from "@/lib/types";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  file: File;
  pages: PageDim[];
  points: SummaryPoint[];
  activeId: string | null;
  /** registers a highlight rect (screen coords) for a point's source region */
  registerHighlight: (id: string, el: HTMLDivElement | null) => void;
  onActivate?: (id: string) => void;
  renderScale?: number;
}

const ZOOMS = [0.75, 1, 1.2, 1.5, 2];

export function PdfCanvas({
  file,
  pages,
  points,
  activeId,
  registerHighlight,
  onActivate,
  renderScale = 1.2,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [url, setUrl] = useState<string>("");
  const [scale, setScale] = useState(renderScale);
  const [current, setCurrent] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // page indicator: whichever page occupies the middle of the viewport
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !numPages) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.page));
        }
      },
      { root, rootMargin: "-45% 0px -45% 0px" },
    );
    pageEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages, scale]);

  function goto(page: number) {
    const el = pageEls.current.get(Math.min(Math.max(page, 1), numPages));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function zoom(dir: 1 | -1) {
    const i = ZOOMS.indexOf(scale);
    const next = ZOOMS[Math.min(Math.max((i === -1 ? 2 : i) + dir, 0), ZOOMS.length - 1)];
    setScale(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-2)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-3 py-1.5">
        <button onClick={() => goto(current - 1)} aria-label="Previous page" className="rounded px-2 py-0.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ↑
        </button>
        <button onClick={() => goto(current + 1)} aria-label="Next page" className="rounded px-2 py-0.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ↓
        </button>
        <span className="mono ml-1 text-[11px] text-[var(--muted)]">
          {current} / {numPages || pages.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => zoom(-1)} aria-label="Zoom out" className="rounded px-2 py-0.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            −
          </button>
          <span className="mono w-10 text-center text-[11px] text-[var(--muted)]">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => zoom(1)} aria-label="Zoom in" className="rounded px-2 py-0.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            +
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {url && (
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={<p className="p-6 text-sm text-[var(--muted)]">Rendering document…</p>}
            error={<p className="p-6 text-sm text-red-500">Could not render this PDF.</p>}
          >
            {Array.from({ length: numPages }, (_, i) => {
              const pageNum = i + 1;
              const dim = pages.find((p) => p.page === pageNum);
              const pagePoints = points.filter((p) => p.page === pageNum);
              return (
                <div
                  key={pageNum}
                  data-page={pageNum}
                  ref={(el) => {
                    if (el) pageEls.current.set(pageNum, el);
                    else pageEls.current.delete(pageNum);
                  }}
                  className="relative mx-auto my-4 w-fit rounded-[var(--radius-sm)] overflow-hidden"
                  style={{ boxShadow: "var(--shadow)" }}
                >
                  <Page pageNumber={pageNum} scale={scale} renderTextLayer renderAnnotationLayer={false} />
                  {/* overlay highlights: scale bbox from PDF point space to rendered px */}
                  {dim &&
                    pagePoints.map((p) =>
                      p.bboxes.map((b, bi) => {
                        const [x0, y0, x1, y1] = b;
                        const active = activeId === p.id;
                        return (
                          <div
                            key={`${p.id}-${bi}`}
                            ref={(el) => {
                              if (bi === 0) registerHighlight(p.id, el);
                            }}
                            data-highlight-for={p.id}
                            onClick={() => onActivate?.(p.id)}
                            className={`absolute cursor-pointer rounded-sm transition-all duration-200 ${
                              active ? "ring-1" : "hover:bg-[var(--accent-soft)]"
                            }`}
                            style={{
                              left: x0 * scale,
                              top: y0 * scale,
                              width: (x1 - x0) * scale,
                              height: (y1 - y0) * scale,
                              background: active ? "var(--highlight)" : undefined,
                              ...(active
                                ? { boxShadow: "0 0 0 1px var(--accent)", filter: "var(--glow)" }
                                : {}),
                            }}
                          />
                        );
                      }),
                    )}
                </div>
              );
            })}
          </Document>
        )}
      </div>
    </div>
  );
}
