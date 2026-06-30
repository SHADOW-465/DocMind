import type { SummarizeResponse, SummaryLength, PageDim, SummaryPoint, Theme } from "./types";

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
    // If it is a network connection error (e.g. backend down), try the serverless API fallback
    const isNetworkError = e instanceof TypeError || 
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

async function summarizeWithApiFallback(file: File, length: SummaryLength): Promise<SummarizeResponse> {
  const startTime = Date.now();

  // 1. Load pdfjs dynamically
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  // 2. Parse PDF in the browser
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pages: PageDim[] = [];
  const allWords: { text: string; bbox: [number, number, number, number]; page: number }[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 }); // scale=1.0 maps to standard PDF points
    pages.push({
      page: pageNum,
      width: viewport.width,
      height: viewport.height,
    });

    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if ("str" in item) {
        const text = item.str;
        if (!text.trim()) continue;

        // item.transform is [scaleX, skewY, skewX, scaleY, transformX, transformY]
        const x0 = item.transform[4];
        const y0 = item.transform[5];
        const x1 = x0 + item.width;
        const y1 = y0 + item.height;

        // Convert coordinates from bottom-left (PDF) to top-left (Viewport)
        const [vx0, vy1] = viewport.convertToViewportPoint(x0, y0);
        const [vx1, vy0] = viewport.convertToViewportPoint(x1, y1);

        // Approximate bounding boxes for individual words in the item
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

          allWords.push({
            text: word,
            bbox: [wvx0, wvy0, wvx1, wvy1],
            page: pageNum,
          });
        }
      }
    }
  }

  // 3. Segment words into sentences
  const sentences: { text: string; page: number; bboxes: [number, number, number, number][] }[] = [];
  let currentSentenceWords: typeof allWords = [];

  for (let i = 0; i < allWords.length; i++) {
    const w = allWords[i];
    currentSentenceWords.push(w);
    const text = w.text;
    const isSentenceEnd = /[.!?]$/.test(text) && !/^(Mr|Dr|Ms|Mrs|Jr|Sr|vs)\.$/i.test(text);
    const nextWord = allWords[i + 1];
    const isPageBreak = nextWord && nextWord.page !== w.page;

    if (isSentenceEnd || isPageBreak || !nextWord) {
      const sentenceText = currentSentenceWords.map(sw => sw.text).join(" ");
      const page = currentSentenceWords[0].page;
      const bboxes = currentSentenceWords.map(sw => sw.bbox);
      sentences.push({ text: sentenceText, page, bboxes });
      currentSentenceWords = [];
    }
  }

  if (sentences.length === 0) {
    throw new Error("No text found in the PDF. Scanned PDFs are not supported.");
  }

  // 4. Send sentences to Next.js API `/api/summarize`
  const response = await fetch("/api/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sentences: sentences.map(s => s.text),
      length,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
    throw new Error(errorBody.message ?? "Summarization failed");
  }

  const llmResult = await response.json() as {
    themes: {
      label: string;
      points: { index: number; text: string }[];
    }[];
  };

  // 5. Construct SummarizeResponse mapping points back to bboxes
  const outPoints: SummaryPoint[] = [];
  const themes: Theme[] = [];
  let pointCounter = 1;

  for (let tIdx = 0; tIdx < llmResult.themes.length; tIdx++) {
    const themeNode = llmResult.themes[tIdx];
    const tid = `t${tIdx + 1}`;
    const pointIds: string[] = [];

    for (let pIdx = 0; pIdx < themeNode.points.length; pIdx++) {
      const pt = themeNode.points[pIdx];
      const sentenceIdx = pt.index;
      
      // Fallback if LLM hallucinated index
      const matchedSentence = sentences[sentenceIdx] || sentences[0];
      const pid = `p${pointCounter++}`;
      pointIds.push(pid);

      const mergedBboxes = mergeLineBboxes(matchedSentence.bboxes);

      outPoints.push({
        id: pid,
        text: pt.text,
        anchorSentence: matchedSentence.text,
        page: matchedSentence.page,
        bboxes: mergedBboxes,
        confidence: Number((0.95 - outPoints.length * 0.02).toFixed(2)),
        themeId: tid,
      });
    }

    themes.push({
      id: tid,
      label: themeNode.label,
      pointIds,
    });
  }

  const totalMs = Date.now() - startTime;

  return {
    docId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    filename: file.name,
    pageCount: numPages,
    pages,
    points: outPoints,
    themes,
    timings: {
      totalMs,
    },
  };
}

function mergeLineBboxes(boxes: [number, number, number, number][], yTol: number = 4.0): [number, number, number, number][] {
  if (boxes.length === 0) return [];
  
  // Sort by vertical center, then by left coordinate
  const sorted = [...boxes].sort((a, b) => {
    const cyA = (a[1] + a[3]) / 2;
    const cyB = (b[1] + b[3]) / 2;
    if (Math.abs(cyA - cyB) <= yTol) {
      return a[0] - b[0];
    }
    return cyA - cyB;
  });

  const lines: [number, number, number, number][][] = [];
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
    if (!placed) {
      lines.push([b]);
    }
  }

  return lines.map(line => {
    const x0 = Math.min(...line.map(b => b[0]));
    const y0 = Math.min(...line.map(b => b[1]));
    const x1 = Math.max(...line.map(b => b[2]));
    const y1 = Math.max(...line.map(b => b[3]));
    return [x0, y0, x1, y1];
  });
}

