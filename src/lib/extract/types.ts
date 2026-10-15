import type { SourceKind } from "../types";

/** One logical unit of a source: a slide, a PDF page, or a whole transcript. */
export type ExtractedSection = {
  label: string; // e.g. "Slide 3", "Page 2", "Transcript"
  title?: string; // slide title when we can detect it
  lines: string[]; // visible text, one bullet/paragraph per entry
  notes?: string[]; // speaker notes (PowerPoint)
  imageText?: string[]; // text recovered from images via OCR
};

export type ExtractedSource = {
  name: string;
  kind: SourceKind;
  sections: ExtractedSection[];
};

export type ExtractContext = {
  warn: (message: string) => void;
  progress: (message: string) => void;
  /** Shared OCR budget across all files in one job. */
  ocrBudget: { remaining: number; used: number };
};
