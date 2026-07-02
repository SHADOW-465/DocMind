/** Stage: extractive ranking of sentences via a small, dependency-free
 * TF-IDF + PageRank-style graph -- the browser-side mirror of
 * `ml/lucent_ml/pipeline/rank.py`. Selected sentences are the ANCHORS: each
 * carries real page + bbox geometry, so any point derived from one is a real
 * citation. A degenerate corpus (e.g. every sentence is only stopwords) falls
 * back to a position prior instead of ever throwing. */
import type { Sentence, RankedSentence } from "./types";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "of", "to", "in",
  "on", "at", "by", "for", "with", "as", "is", "are", "was", "were", "be",
  "been", "being", "it", "its", "this", "that", "these", "those", "i", "you",
  "he", "she", "we", "they", "them", "his", "her", "their", "our", "your",
  "not", "so", "such", "from", "into", "about", "than", "too", "very", "can",
  "will", "just", "do", "does", "did",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, va] of a) {
    normA += va * va;
    const vb = b.get(term);
    if (vb) dot += va * vb;
  }
  for (const vb of b.values()) normB += vb * vb;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tfidfVectors(docs: string[][]): Map<string, number>[] {
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const n = docs.length;
  return docs.map((doc) => {
    const termFreq = new Map<string, number>();
    for (const term of doc) termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    const vector = new Map<string, number>();
    for (const [term, count] of termFreq) {
      const idf = Math.log((n + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;
      vector.set(term, count * idf);
    }
    return vector;
  });
}

function pageRank(similarity: number[][], iterations = 100, damping = 0.85): number[] {
  const n = similarity.length;
  if (n === 0) return [];
  const weights = similarity.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return sum > 0 ? row.map((v) => v / sum) : row.map(() => 1 / n);
  });
  let scores = new Array(n).fill(1 / n);
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Array(n).fill((1 - damping) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        next[j] += damping * scores[i] * weights[i][j];
      }
    }
    scores = next;
  }
  return scores;
}

export function rankSentences(sentences: Sentence[], topN: number): RankedSentence[] {
  if (sentences.length === 0) return [];
  if (sentences.length === 1) {
    return [{ sentence: sentences[0], confidence: 1 }];
  }

  const tokenized = sentences.map((s) => tokenize(s.text));
  const hasVocabulary = tokenized.some((doc) => doc.length > 0);

  let scores: number[];
  if (hasVocabulary) {
    const vectors = tfidfVectors(tokenized);
    const similarity = vectors.map((vi) => vectors.map((vj) => cosineSimilarity(vi, vj)));
    scores = pageRank(similarity);
  } else {
    // Degenerate corpus -- no usable vocabulary. Fall back to a position
    // prior so we still return real anchors instead of throwing.
    scores = sentences.map((_, i) => sentences.length - i);
  }

  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const range = hi - lo || 1;
  const normalized = scores.map((s) => (s - lo) / range);

  const order = sentences.map((_, i) => i).sort((a, b) => normalized[b] - normalized[a]);
  const chosen = order.slice(0, Math.max(0, topN));
  return chosen.map((i) => ({
    sentence: sentences[i],
    confidence: Math.round(normalized[i] * 10000) / 10000,
  }));
}
