"use client";
import { useRef, useState } from "react";

export function UploadZone({
  onFile,
  disabled,
  compact,
}: {
  onFile: (f: File) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setRejected(`${f.name} isn't a PDF. Lucent needs a PDF's text layer to cite it.`);
      return;
    }
    setRejected(null);
    onFile(f);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload a PDF"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`cursor-pointer rounded-[var(--radius)] border-2 border-dashed text-center transition-transform duration-150
          ${compact ? "p-8" : "p-14"}
          ${dragging ? "scale-[1.02] border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"}
          ${disabled ? "pointer-events-none opacity-50" : ""}`}
        style={{ boxShadow: dragging ? "var(--shadow-lift)" : "var(--shadow)" }}
      >
        <div
          className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white"
          style={{ background: "var(--grad)" }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
          </svg>
        </div>
        <p className="text-lg font-medium">Drop a PDF here</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          or click to choose a file · stays on your device
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      {rejected && <p className="mt-3 text-sm text-red-500">{rejected}</p>}
    </div>
  );
}
