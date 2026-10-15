import "server-only";
import { extractText, getDocumentProxy, getResolvedPDFJS, renderPageAsImage } from "unpdf";
import { ocrImage } from "./ocr";
import type { ExtractContext, ExtractedSection, ExtractedSource } from "./types";

/** Long side of a rendered page, in pixels: ~2.5x for Letter, enough for 9pt type. */
const RENDER_LONG_SIDE = 2400;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export async function extractPdf(
  buffer: Buffer,
  name: string,
  ctx: ExtractContext,
): Promise<ExtractedSource> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    throw new Error(`${name} couldn't be opened as a PDF. It may be corrupted or password-protected.`);
  }

  try {
    const { OPS } = await getResolvedPDFJS();
    const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat]);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const sections: ExtractedSection[] = [];
    let skippedForBudget = 0;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      ctx.progress(`Reading ${name}: page ${pageNumber} of ${totalPages}`);
      let lines = (text[pageNumber - 1] ?? "")
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      // Pages often carry their words inside pictures: slides exported as images, or
      // documents whose text was flattened into hundreds of image strips. OCR-ing each
      // strip loses words, so render the whole page once and read it like a scan.
      const page = await pdf.getPage(pageNumber);
      const { fnArray } = await page.getOperatorList();
      const hasImages = fnArray.some((op) => imageOps.has(op));

      const imageText: string[] = [];
      if (hasImages) {
        if (ctx.ocrBudget.remaining <= 0) {
          skippedForBudget++;
        } else {
          ctx.ocrBudget.remaining--;
          ctx.ocrBudget.used++;
          ctx.progress(`Scanning page ${pageNumber} of ${totalPages} for text in images (${name})`);
          try {
            const viewport = page.getViewport({ scale: 1 });
            const scale = RENDER_LONG_SIDE / Math.max(viewport.width, viewport.height);
            const png = await renderPageAsImage(pdf, pageNumber, {
              canvasImport: () => import("@napi-rs/canvas"),
              scale,
            });
            const recognized = await ocrImage(Buffer.from(png));
            if (recognized) {
              imageText.push(recognized);
              // The scan already includes the page's selectable text, in reading order.
              // Keep only text-layer lines the scan missed.
              const scanned = normalize(recognized);
              lines = lines.filter((line) => !scanned.includes(normalize(line)));
            }
          } catch (err) {
            console.error(`[pdf] OCR failed on page ${pageNumber} of ${name}`, err);
            ctx.warn(`Couldn't read the images on page ${pageNumber} of ${name}.`);
          }
        }
      }
      page.cleanup();

      if (lines.length || imageText.length) {
        sections.push({ label: `Page ${pageNumber}`, lines, imageText });
      }
    }

    if (skippedForBudget) {
      ctx.warn(`Skipped scanning ${skippedForBudget} page(s) for text in images to keep processing time reasonable.`);
    }
    return { name, kind: "pdf", sections };
  } finally {
    await pdf.cleanup().catch(() => undefined);
  }
}
