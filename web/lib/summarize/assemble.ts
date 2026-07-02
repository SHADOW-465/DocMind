/** Stage: bind an LLM's selection/reword output back to real ranked candidates.
 *
 * The LLM may only reference a candidate by its `index`; this module is the
 * single point where that index is validated before it can become part of a
 * SummaryPoint. A hallucinated or duplicate index is dropped, never guessed
 * or remapped -- the citation-integrity guarantee for the serverless fallback
 * path lives entirely in this file. */
import type { RankedSentence } from "./types";
import type { SummaryPoint, Theme } from "../types";

export type Bbox = [number, number, number, number];

export function mergeLineBboxes(boxes: Bbox[], yTol: number = 4.0): Bbox[] {
  if (boxes.length === 0) return [];
  const sorted = [...boxes].sort((a, b) => {
    const cyA = (a[1] + a[3]) / 2;
    const cyB = (b[1] + b[3]) / 2;
    if (Math.abs(cyA - cyB) <= yTol) return a[0] - b[0];
    return cyA - cyB;
  });
  const lines: Bbox[][] = [];
  for (const b of sorted) {
    const cy = (b[1] + b[3]) / 2;
    let placed = false;
    for (const line of lines) {
      const lcy = (line[0][1] + line[0][3]) / 2;
      if (Math.abs(cy - lcy) <= yTol) {
        line.push(b);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([b]);
  }
  return lines.map((line) => [
    Math.min(...line.map((b) => b[0])),
    Math.min(...line.map((b) => b[1])),
    Math.max(...line.map((b) => b[2])),
    Math.max(...line.map((b) => b[3])),
  ]);
}

export interface LlmPoint {
  index: number;
  text: string;
}
export interface LlmThemeNode {
  label: string;
  points: LlmPoint[];
}
export interface LlmSummarizeResult {
  themes: LlmThemeNode[];
}

export interface AssembledResult {
  points: SummaryPoint[];
  themes: Theme[];
}

/**
 * Bind the LLM's theme/point selection back to real ranked candidates.
 *
 * - A point's `index` must be an integer within `[0, ranked.length)` and not
 *   already used by an earlier point; otherwise it is DROPPED (never
 *   remapped to a different candidate -- that was the original bug).
 * - `anchorSentence`, `page`, `bboxes`, and `confidence` all come from the
 *   real candidate at that index -- never from anything the LLM wrote.
 * - If fewer than `targetCount` valid points result, the shortfall is filled
 *   from the next-highest-ranked UNUSED candidates, verbatim (no reword),
 *   grouped into a synthetic "Additional" theme.
 */
export function bindPointsToCandidates(
  llmResult: LlmSummarizeResult,
  ranked: RankedSentence[],
  targetCount: number,
): AssembledResult {
  const usedIndices = new Set<number>();
  const points: SummaryPoint[] = [];
  const themes: Theme[] = [];
  let pointCounter = 1;

  for (let tIdx = 0; tIdx < (llmResult.themes ?? []).length; tIdx++) {
    const themeNode = llmResult.themes[tIdx];
    const tid = `t${tIdx + 1}`;
    const pointIds: string[] = [];

    for (const pt of themeNode.points ?? []) {
      const idx = pt.index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= ranked.length || usedIndices.has(idx)) {
        continue; // hallucinated or duplicate index -- dropped, never remapped
      }
      usedIndices.add(idx);
      const candidate = ranked[idx];
      const pid = `p${pointCounter++}`;
      pointIds.push(pid);
      points.push({
        id: pid,
        text: pt.text,
        anchorSentence: candidate.sentence.text,
        page: candidate.sentence.page,
        bboxes: mergeLineBboxes(candidate.sentence.bboxes),
        confidence: candidate.confidence,
        themeId: tid,
      });
    }

    if (pointIds.length > 0) {
      themes.push({ id: tid, label: themeNode.label, pointIds });
    }
  }

  if (points.length < targetCount) {
    const fillTid = `t${themes.length + 1}`;
    const fillIds: string[] = [];
    for (let idx = 0; idx < ranked.length && points.length < targetCount; idx++) {
      if (usedIndices.has(idx)) continue;
      usedIndices.add(idx);
      const candidate = ranked[idx];
      const pid = `p${pointCounter++}`;
      fillIds.push(pid);
      points.push({
        id: pid,
        text: candidate.sentence.text, // verbatim -- no reword available for a fallback fill
        anchorSentence: candidate.sentence.text,
        page: candidate.sentence.page,
        bboxes: mergeLineBboxes(candidate.sentence.bboxes),
        confidence: candidate.confidence,
        themeId: fillTid,
      });
    }
    if (fillIds.length > 0) {
      themes.push({ id: fillTid, label: "Additional", pointIds: fillIds });
    }
  }

  return { points, themes };
}
