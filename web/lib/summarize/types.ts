/** Types + small policy constants shared by the client-side (browser) summarize
 * pipeline (segment -> rank -> assemble) and the Next.js `/api/summarize` route
 * that performs the bounded LLM select-and-reword step. */
import type { SummaryLength } from "../types";

export interface ExtractedWord {
  text: string;
  bbox: [number, number, number, number];
  page: number;
}

export interface Sentence {
  text: string;
  page: number;
  bboxes: [number, number, number, number][];
}

export interface RankedSentence {
  sentence: Sentence;
  confidence: number; // 0..1, real rank score -- never fabricated
}

/** A candidate as sent to the LLM: only an index + its text. The LLM may
 * reference a selected point back to a candidate ONLY by this index. */
export interface LlmCandidate {
  index: number;
  text: string;
}

/** Target number of summary points per length preset -- mirrors
 * `ml/lucent_ml/settings.py`'s `LENGTH_TARGETS` so both summarization paths
 * agree on what "short/medium/detailed" means.
 *
 * Typed as `Record<string, number>` (not `Record<SummaryLength, number>`)
 * because callers look this up with a plain string parsed from form data /
 * JSON, which isn't statically guaranteed to be a valid SummaryLength -- the
 * `?? LENGTH_TARGETS.medium` fallback at call sites handles that at runtime.
 * The `satisfies` clause still catches a typo'd key in the literal itself. */
export const LENGTH_TARGETS: Record<string, number> = {
  short: 6,
  medium: 10,
  detailed: 16,
} satisfies Record<SummaryLength, number>;

/** How many ranked candidates to offer the LLM for a given target point count:
 * ~2.5x the target so it has real choices to select from, capped at 40 to keep
 * the prompt bounded regardless of document length. */
export function candidateCount(targetCount: number): number {
  return Math.min(40, Math.max(targetCount, Math.round(targetCount * 2.5)));
}
