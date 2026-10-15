import "server-only";
import mammoth from "mammoth";
import { config } from "../config";
import { ocrImage } from "./ocr";
import { loadZip } from "./pptx";
import type { ExtractContext, ExtractedSource } from "./types";

const OCR_EXTENSIONS = /\.(png|jpe?g|bmp|gif|tiff?|webp)$/i;

export async function extractDocx(
  buffer: Buffer,
  name: string,
  ctx: ExtractContext,
): Promise<ExtractedSource> {
  // Open the zip ourselves first so the size guard runs before mammoth inflates anything.
  const zip = await loadZip(buffer, name);

  ctx.progress(`Reading ${name}`);
  const { value } = await mammoth.extractRawText({ buffer });
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const imageText: string[] = [];
  const media = Object.keys(zip.files).filter((p) => p.startsWith("word/media/") && OCR_EXTENSIONS.test(p));
  let skippedForBudget = 0;
  for (const [index, path] of media.entries()) {
    const data = await zip.file(path)!.async("nodebuffer");
    if (data.length < config.limits.minOcrImageBytes) continue;
    if (ctx.ocrBudget.remaining <= 0) {
      skippedForBudget++;
      continue;
    }
    ctx.ocrBudget.remaining--;
    ctx.ocrBudget.used++;
    ctx.progress(`Scanning image ${index + 1} of ${media.length} in ${name}`);
    try {
      const text = await ocrImage(data);
      if (text) imageText.push(text);
    } catch {
      ctx.warn(`Couldn't read text from an image in ${name}.`);
    }
  }
  if (skippedForBudget) {
    ctx.warn(`Skipped text recognition on ${skippedForBudget} image(s) to keep processing time reasonable.`);
  }

  return { name, kind: "docx", sections: [{ label: "Document", lines, imageText }] };
}
