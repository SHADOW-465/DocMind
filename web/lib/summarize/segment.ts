/** Stage: group extracted PDF words into sentences that carry page + bbox
 * geometry -- the browser-side mirror of `ml/lucent_ml/pipeline/segment.py`.
 *
 * Words are reconstructed into a single string per page (so a sentence never
 * spans two pages), segmented with the browser's built-in `Intl.Segmenter`,
 * and each sentence's character span is mapped back to the words it covers so
 * every sentence keeps real geometry. */
import type { ExtractedWord, Sentence } from "./types";

interface WordSpan {
  start: number;
  end: number;
  word: ExtractedWord;
}

function pageTextAndSpans(words: ExtractedWord[]): { text: string; spans: WordSpan[] } {
  const parts: string[] = [];
  const spans: WordSpan[] = [];
  let cursor = 0;
  for (const w of words) {
    if (parts.length > 0) cursor += 1; // the space separator
    const start = cursor;
    parts.push(w.text);
    cursor += w.text.length;
    spans.push({ start, end: cursor, word: w });
  }
  return { text: parts.join(" "), spans };
}

export function segmentIntoSentences(words: ExtractedWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  const pages = Array.from(new Set(words.map((w) => w.page))).sort((a, b) => a - b);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

  for (const page of pages) {
    const pageWords = words.filter((w) => w.page === page);
    const { text, spans } = pageTextAndSpans(pageWords);
    if (!text.trim()) continue;

    for (const { segment, index } of segmenter.segment(text)) {
      const leadingWs = segment.length - segment.trimStart().length;
      const raw = segment.trim();
      if (!raw) continue;
      const start = index + leadingWs;
      const end = start + raw.length;
      const bboxes = spans
        .filter((s) => s.start < end && s.end > start)
        .map((s) => s.word.bbox);
      if (bboxes.length === 0) continue;
      sentences.push({ text: raw, page, bboxes });
    }
  }
  return sentences;
}
