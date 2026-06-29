export interface PageDim { page: number; width: number; height: number; }
export interface SummaryPoint {
  id: string; text: string; anchorSentence: string; page: number;
  bboxes: [number, number, number, number][]; confidence: number; themeId: string;
}
export interface Theme { id: string; label: string; pointIds: string[]; }
export interface SummarizeResponse {
  docId: string; filename: string; pageCount: number;
  pages: PageDim[]; points: SummaryPoint[]; themes: Theme[];
  timings: Record<string, number>;
}
export type SummaryLength = "short" | "medium" | "detailed";
