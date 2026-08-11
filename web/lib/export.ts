import type { SummarizeResponse } from "./types";

/** Summary as citation-carrying Markdown — the format people actually paste into
 * notes/docs, with the verbatim source sentence kept next to each point. */
export function toMarkdown(r: SummarizeResponse): string {
  const lines = [`# ${r.filename}`, "", `_${r.points.length} points · ${r.pageCount} pages · summarized with Lucent_`, ""];
  for (const t of r.themes) {
    const pts = r.points.filter((p) => t.pointIds.includes(p.id));
    if (!pts.length) continue;
    lines.push(`## ${t.label}`, "");
    for (const p of pts) {
      lines.push(`- ${p.text} _(p. ${p.page})_`);
      lines.push(`  > ${p.anchorSentence}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
