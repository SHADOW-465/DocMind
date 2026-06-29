"use client";
import { useRef, useState } from "react";

export function UploadZone({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (f && f.type === "application/pdf") onFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition
        ${dragging ? "border-[var(--accent)] bg-indigo-50" : "border-gray-300"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <p className="text-lg font-medium">Drop a PDF here</p>
      <p className="text-sm text-[var(--muted)] mt-1">or click to choose a file</p>
      <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}
