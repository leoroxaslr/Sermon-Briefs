import "server-only";
import JSZip from "jszip";
import { config } from "../config";
import { ocrImage } from "./ocr";
import type { ExtractContext, ExtractedSection, ExtractedSource } from "./types";
import { attr, paragraphs, relationships, resolvePart } from "./xml";

const OCR_EXTENSIONS = /\.(png|jpe?g|bmp|gif|tiff?|webp)$/i;

export async function loadZip(buffer: Buffer, fileName: string): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(`${fileName} isn't a valid Office file (it may be corrupted or an older .ppt/.doc format).`);
  }
  // Zip-bomb guard: check declared uncompressed sizes before inflating anything.
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    total += size;
  }
  if (total > config.limits.maxUncompressedBytes || Object.keys(zip.files).length > 20_000) {
    throw new Error(`${fileName} is too large to process safely.`);
  }
  return zip;
}

const readText = async (zip: JSZip, path: string) => (await zip.file(path)?.async("string")) ?? "";

/** Slide part paths in presentation order (falls back to numeric order). */
async function slideOrder(zip: JSZip): Promise<string[]> {
  const presentation = await readText(zip, "ppt/presentation.xml");
  const rels = relationships(await readText(zip, "ppt/_rels/presentation.xml.rels"));
  const byId = new Map(rels.map((r) => [r.id, resolvePart("ppt", r.target)]));
  const ordered = (presentation.match(/<p:sldId\b[^>]*>/g) ?? [])
    .map((tag) => byId.get(attr(tag, "r:id") ?? ""))
    .filter((p): p is string => !!p && !!zip.file(p));
  if (ordered.length) return ordered;

  return Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
}

/** Split a slide into title text and body text using placeholder types. */
function slideText(xml: string): { title?: string; lines: string[] } {
  let title: string | undefined;
  const lines: string[] = [];
  for (const shape of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? []) {
    const ph = shape.match(/<p:ph\b[^>]*>/)?.[0];
    const phType = ph ? attr(ph, "type") : undefined;
    if (phType === "sldNum" || phType === "dt" || phType === "ftr") continue;
    const text = paragraphs(shape);
    if (!title && (phType === "title" || phType === "ctrTitle")) title = text.join(" ");
    else lines.push(...text);
  }
  // Tables and grouped shapes live outside <p:sp>; catch their text too.
  for (const frame of xml.match(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g) ?? []) {
    lines.push(...paragraphs(frame));
  }
  return { title, lines };
}

function notesText(xml: string): string[] {
  const out: string[] = [];
  for (const shape of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? []) {
    const ph = shape.match(/<p:ph\b[^>]*>/)?.[0];
    const phType = ph ? attr(ph, "type") : undefined;
    if (phType === "body" || (!phType && ph)) out.push(...paragraphs(shape));
  }
  return out;
}

export async function extractPptx(
  buffer: Buffer,
  name: string,
  ctx: ExtractContext,
): Promise<ExtractedSource> {
  const zip = await loadZip(buffer, name);
  const slides = await slideOrder(zip);
  if (slides.length === 0) throw new Error(`${name} doesn't contain any slides.`);

  const sections: ExtractedSection[] = [];
  const seenImages = new Set<string>();
  let skippedForBudget = 0;

  for (const [index, slidePath] of slides.entries()) {
    ctx.progress(`Reading ${name}: slide ${index + 1} of ${slides.length}`);
    const xml = await readText(zip, slidePath);
    const { title, lines } = slideText(xml);

    const slideDir = slidePath.slice(0, slidePath.lastIndexOf("/"));
    const relsPath = `${slideDir}/_rels/${slidePath.slice(slideDir.length + 1)}.rels`;
    const rels = relationships(await readText(zip, relsPath));

    const notesRel = rels.find((r) => r.type.endsWith("/notesSlide"));
    const notes = notesRel ? notesText(await readText(zip, resolvePart(slideDir, notesRel.target))) : [];

    const imageText: string[] = [];
    for (const rel of rels.filter((r) => r.type.endsWith("/image"))) {
      const mediaPath = resolvePart(slideDir, rel.target);
      // Each unique image is scanned once (repeated logos/backgrounds are skipped).
      if (seenImages.has(mediaPath) || !OCR_EXTENSIONS.test(mediaPath)) continue;
      seenImages.add(mediaPath);

      const file = zip.file(mediaPath);
      if (!file) continue;
      const data = await file.async("nodebuffer");
      if (data.length < config.limits.minOcrImageBytes) continue;
      if (ctx.ocrBudget.remaining <= 0) {
        skippedForBudget++;
        continue;
      }
      ctx.ocrBudget.remaining--;
      ctx.ocrBudget.used++;
      ctx.progress(`Scanning image text on slide ${index + 1} of ${slides.length} (${name})`);
      try {
        const text = await ocrImage(data);
        if (text) imageText.push(text);
      } catch {
        ctx.warn(`Couldn't read text from an image on slide ${index + 1} of ${name}.`);
      }
    }

    if (title || lines.length || notes.length || imageText.length) {
      sections.push({ label: `Slide ${index + 1}`, title, lines, notes, imageText });
    }
  }

  if (skippedForBudget) {
    ctx.warn(`Skipped text recognition on ${skippedForBudget} image(s) to keep processing time reasonable.`);
  }
  return { name, kind: "pptx", sections };
}
