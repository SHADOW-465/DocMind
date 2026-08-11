"use client";
import type { RecentDocMeta } from "@/lib/recentDocs";

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RecentDocCard({
  doc,
  onOpen,
  onDelete,
}: {
  doc: RecentDocMeta;
  onOpen: (docId: string) => void;
  onDelete: (docId: string) => void;
}) {
  return (
    <div className="panel lift group relative overflow-hidden text-left">
      <button
        onClick={() => onOpen(doc.docId)}
        className="block w-full text-left"
        aria-label={`Open ${doc.filename}`}
      >
        <div className="h-24 w-full opacity-80" style={{ background: "var(--grad-2)" }} />
        <div className="p-4">
          <p className="truncate text-sm font-medium" title={doc.filename}>
            {doc.filename}
          </p>
          <p className="mono mt-2 text-[11px] text-[var(--muted)]">
            {doc.pageCount} pp · {doc.pointCount} points · {ago(doc.addedAt)}
          </p>
        </div>
      </button>
      <button
        onClick={() => onDelete(doc.docId)}
        aria-label={`Remove ${doc.filename}`}
        title="Remove"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/30 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
