"use client";
import { useEffect, useState } from "react";
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
  renderScale?: number;
}

export function PdfCanvas({ file, pages, points, activeId, registerHighlight, renderScale = 1.2 }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [url, setUrl] = useState<string>("");

  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);

  return (
    <div className="overflow-y-auto h-full bg-gray-50">
      {url && (
        <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum = i + 1;
            const dim = pages.find((p) => p.page === pageNum);
            const pagePoints = points.filter((p) => p.page === pageNum);
            return (
              <div key={pageNum} className="relative mx-auto my-4 w-fit">
                <Page pageNumber={pageNum} scale={renderScale} renderTextLayer renderAnnotationLayer={false} />
                {/* overlay highlights: scale bbox from PDF point space to rendered px */}
                {dim && pagePoints.map((p) =>
                  p.bboxes.map((b, bi) => {
                    const [x0, y0, x1, y1] = b;
                    const style = {
                      left: x0 * renderScale, top: y0 * renderScale,
                      width: (x1 - x0) * renderScale, height: (y1 - y0) * renderScale,
                    };
                    return (
                      <div
                        key={`${p.id}-${bi}`}
                        ref={(el) => registerHighlight(p.id, el)}
                        data-highlight-for={p.id}
                        className={`absolute rounded-sm transition ${
                          activeId === p.id ? "bg-indigo-300/50 ring-1 ring-[var(--accent)]" : "bg-transparent"
                        }`}
                        style={style}
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
  );
}
