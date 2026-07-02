import type { SummarizeResponse, SummaryLength, PageDim } from "./types";
import { segmentIntoSentences } from "./summarize/segment";
import { rankSentences } from "./summarize/rank";
import { bindPointsToCandidates, type LlmSummarizeResult } from "./summarize/assemble";
import { LENGTH_TARGETS, candidateCount } from "./summarize/types";
import type { ExtractedWord } from "./summarize/types";

const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? "http://localhost:8000";

export async function checkHealth(): Promise<boolean> {
  // 1. Try local Python backend
  try {
    const r = await fetch(`${ML_URL}/healthz`);
    if (r.ok) {
      const body = await r.json();
      if (body.status === "ok") return true;
    }
  } catch {
    // Ignore and try Next.js API fallback
  }

  // 2. Check Next.js server health (API keys)
  return await checkHealthOnlyFallback();
}

async function checkHealthOnlyFallback(): Promise<boolean> {
  try {
    const r = await fetch("/api/health");
    if (r.ok) {
      const body = await r.json();
      return !!body.fallbackEnabled;
    }
  } catch {
    // ignore
  }
  return false;
}

export async function summarize(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("length", length);
    fd.append("group", "true");
    const r = await fetch(`${ML_URL}/summarize`, { method: "POST", body: fd });
    if (!r.ok) {
      const body = await r.json().catch(() => ({ message: `request failed (${r.status})` }));
      throw new Error(body.message ?? "summarization failed");
    }
    return (await r.json()) as SummarizeResponse;
  } catch (e) {
    const isNetworkError =
      e instanceof TypeError ||
      (e as Error).message === "Failed to fetch" ||
      (e as Error).message.includes("fetch failed") ||
      (e as Error).message.includes("NetworkError");
    if (isNetworkError) {
      const fallbackAvailable = await checkHealthOnlyFallback();
      if (fallbackAvailable) {
        return await summarizeWithApiFallback(file, length);
      }
    }
    throw e;
  }
}

async function extractWords(file: File): Promise<{ pages: PageDim[]; words: ExtractedWord[] }> {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pages: PageDim[] = [];
  const words: ExtractedWord[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 }); // scale=1.0 maps to standard PDF points
    pages.push({ page: pageNum, width: viewport.width, height: viewport.height });

    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      const text = item.str;
      if (!text.trim()) continue;

      const x0 = item.transform[4];
      const y0 = item.transform[5];
      const x1 = x0 + item.width;
      const y1 = y0 + item.height;

      const [vx0, vy1] = viewport.convertToViewportPoint(x0, y0);
      const [vx1, vy0] = viewport.convertToViewportPoint(x1, y1);

      const wordsInItem = text.split(/\s+/);
      let charOffset = 0;
      for (const word of wordsInItem) {
        if (!word) continue;
        const wordStartIdx = text.indexOf(word, charOffset);
        const wordEndIdx = wordStartIdx + word.length;
        charOffset = wordEndIdx;

        const wx0 = x0 + (wordStartIdx / text.length) * item.width;
        const wx1 = x0 + (wordEndIdx / text.length) * item.width;

        const [wvx0, wvy1] = viewport.convertToViewportPoint(wx0, y0);
        const [wvx1, wvy0] = viewport.convertToViewportPoint(wx1, y1);

        words.push({ text: word, bbox: [wvx0, wvy0, wvx1, wvy1], page: pageNum });
      }
    }
  }

  return { pages, words };
}

async function summarizeWithApiFallback(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  const startTime = Date.now();

  const { pages, words } = await extractWords(file);
  const sentences = segmentIntoSentences(words);

  if (sentences.length === 0) {
    throw new Error("No text found in the PDF. Scanned PDFs are not supported.");
  }

  const N = LENGTH_TARGETS[length] ?? LENGTH_TARGETS.medium;
  const K = candidateCount(N);
  const ranked = rankSentences(sentences, K);
  const candidates = ranked.map((r, i) => ({ index: i, text: r.sentence.text }));

  const response = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, length }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
    throw new Error(errorBody.message ?? "Summarization failed");
  }

  const llmResult = (await response.json()) as LlmSummarizeResult;
  const { points, themes } = bindPointsToCandidates(llmResult, ranked, N);

  return {
    docId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    filename: file.name,
    pageCount: pages.length,
    pages,
    points,
    themes,
    timings: { totalMs: Date.now() - startTime },
  };
}
