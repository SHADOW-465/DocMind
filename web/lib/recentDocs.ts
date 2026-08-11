/** Browser-local "recent documents" store (IndexedDB). Convenience only — the
 * server stays stateless. Holds the original PDF blob + the full
 * SummarizeResponse so re-opening needs neither re-upload nor a second
 * /summarize round trip. */
import type { SummarizeResponse } from "./types";

export interface RecentDocument {
  docId: string;
  filename: string;
  addedAt: number;
  pageCount: number;
  pointCount: number;
  pdfBlob: Blob;
  summary: SummarizeResponse;
}

/** Metadata-only view for the home grid (no blob, no summary payload). */
export type RecentDocMeta = Omit<RecentDocument, "pdfBlob" | "summary">;

const DB = "lucent";
const STORE = "recentDocuments";
export const MAX_RECENT = 12;

/** Which docIds to drop so at most `max` remain, oldest evicted first. Pure. */
export function evictIds(docs: { docId: string; addedAt: number }[], max = MAX_RECENT): string[] {
  return [...docs]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(max)
    .map((d) => d.docId);
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexeddb"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "docId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listRecent(): Promise<RecentDocMeta[]> {
  try {
    const all = await run<RecentDocument[]>("readonly", (s) => s.getAll());
    return all
      .map(({ pdfBlob: _b, summary: _s, ...meta }) => meta)
      .sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function getRecent(docId: string): Promise<RecentDocument | null> {
  try {
    return (await run<RecentDocument>("readonly", (s) => s.get(docId))) ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget: a storage failure must never break the summarize flow. */
export async function saveRecent(file: File, summary: SummarizeResponse): Promise<void> {
  try {
    await run("readwrite", (s) =>
      s.put({
        docId: summary.docId,
        filename: summary.filename || file.name,
        addedAt: Date.now(),
        pageCount: summary.pageCount,
        pointCount: summary.points.length,
        pdfBlob: file,
        summary,
      } satisfies RecentDocument),
    );
    const stale = evictIds(await listRecent());
    await Promise.all(stale.map((id) => run("readwrite", (s) => s.delete(id))));
  } catch {
    /* non-critical */
  }
}

export async function clearRecent(): Promise<void> {
  try {
    await run("readwrite", (s) => s.clear());
  } catch {
    /* non-critical */
  }
}

export async function deleteRecent(docId: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(docId));
  } catch {
    /* non-critical */
  }
}
