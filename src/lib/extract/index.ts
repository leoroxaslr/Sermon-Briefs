import "server-only";
import type { ExtractionStats, SourceKind } from "../types";
import { extractDocx } from "./docx";
import { ocrImage } from "./ocr";
import { extractPdf } from "./pdf";
import { extractPptx } from "./pptx";
import { decodeText, extractPlainText } from "./text";
import type { ExtractContext, ExtractedSource } from "./types";

export type UploadedFile = { name: string; kind: SourceKind; buffer: Buffer };

const KIND_BY_EXTENSION: Record<string, SourceKind> = {
  pptx: "pptx",
  pdf: "pdf",
  docx: "docx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  bmp: "image",
  gif: "image",
  tif: "image",
  tiff: "image",
  srt: "transcript",
  vtt: "transcript",
  txt: "text",
  md: "text",
};

/** Formats people commonly try that we can't read, with a helpful pointer. */
const UNSUPPORTED_HINTS: Record<string, string> = {
  ppt: "Open it in PowerPoint or Keynote and save it as .pptx.",
  key: "In Keynote, choose File → Export To → PowerPoint.",
  doc: "Open it in Word and save it as .docx.",
  pages: "In Pages, choose File → Export To → Word.",
  heic: "Export the photo as JPEG or PNG first.",
};

export const ACCEPTED_EXTENSIONS = Object.keys(KIND_BY_EXTENSION);

export function detectKind(fileName: string): { kind: SourceKind } | { error: string } {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const kind = KIND_BY_EXTENSION[ext];
  if (kind) return { kind };
  const hint = UNSUPPORTED_HINTS[ext];
  return { error: `${fileName} isn't a supported file type.${hint ? ` ${hint}` : ""}` };
}

async function extractOne(file: UploadedFile, ctx: ExtractContext): Promise<ExtractedSource> {
  switch (file.kind) {
    case "pptx":
      return extractPptx(file.buffer, file.name, ctx);
    case "pdf":
      return extractPdf(file.buffer, file.name, ctx);
    case "docx":
      return extractDocx(file.buffer, file.name, ctx);
    case "image": {
      ctx.progress(`Scanning text in ${file.name}`);
      ctx.ocrBudget.used++;
      const text = await ocrImage(file.buffer);
      if (!text) ctx.warn(`No readable text was found in ${file.name}.`);
      return { name: file.name, kind: "image", sections: [{ label: "Image", lines: [], imageText: text ? [text] : [] }] };
    }
    default:
      return extractPlainText(decodeText(file.buffer), file.name, file.kind);
  }
}

/**
 * Render extracted sources as lightly structured Markdown. This is both what we
 * send to Tavily and what the local engine parses, so the format is stable:
 * "# Source:" per file, "## <label>[: title]" per slide/page, and bracketed sub-blocks.
 */
export function renderSources(sources: ExtractedSource[]): string {
  const out: string[] = [];
  for (const source of sources) {
    out.push(`# Source: ${source.name} (${source.kind})`, "");
    for (const section of source.sections) {
      out.push(`## ${section.label}${section.title ? `: ${section.title}` : ""}`);
      out.push(...section.lines);
      if (section.imageText?.length) out.push("[Text in images]", ...section.imageText);
      if (section.notes?.length) out.push("[Speaker notes]", ...section.notes);
      out.push("");
    }
  }
  return out.join("\n").trim();
}

export const countWords = (text: string) => text.match(/[\p{L}\p{N}'’]+/gu)?.length ?? 0;

export async function extractAll(
  files: UploadedFile[],
  pastedText: string,
  ctx: ExtractContext,
): Promise<{ text: string; stats: ExtractionStats }> {
  const sources: ExtractedSource[] = [];
  for (const file of files) {
    try {
      sources.push(await extractOne(file, ctx));
    } catch (err) {
      // One bad file shouldn't sink the others; report it and keep going.
      ctx.warn(err instanceof Error ? err.message : `Couldn't read ${file.name}.`);
    }
  }
  if (pastedText.trim()) {
    sources.push(extractPlainText(pastedText, "Pasted text", "pasted"));
  }

  const text = renderSources(sources);
  return {
    text,
    stats: {
      slides: sources.filter((s) => s.kind === "pptx").reduce((n, s) => n + s.sections.length, 0),
      pages: sources.filter((s) => s.kind === "pdf").reduce((n, s) => n + s.sections.length, 0),
      imagesScanned: ctx.ocrBudget.used,
      words: countWords(text),
    },
  };
}
