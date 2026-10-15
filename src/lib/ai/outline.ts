import type { BriefContent } from "../types";

/**
 * Find the sermon's own outline in the source: main points numbered with Roman
 * numerals (I., II., III.) and sub-points lettered under them (A., B., C.).
 * Numbering must run in sequence, which keeps stray "A." lines from matching.
 */

export type DetectedOutline = { heading: string; points: string[] }[];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const NOT_A_POINT = /^(conclusion|introduction|intro|closing|summary|application|invitation)\b/i;

/** OCR misreads "I" as "l", "1" or "|" in numerals. */
const fixNumeral = (s: string) => s.replace(/[l1|]/g, "I");

const clean = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/[.:;,]+$/, "")
    .trim();

export function detectOutline(sourceText: string): DetectedOutline | null {
  const outline: DetectedOutline = [];
  let nextMain = 0;
  let nextSub = 0;
  let current: DetectedOutline[number] | null = null;

  for (const raw of sourceText.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;

    const main = line.match(/^([IVXl1|]{1,4})[.)]\s+(.{3,100})$/);
    if (main) {
      const numeral = fixNumeral(main[1]);
      const index = ROMAN.indexOf(numeral);
      if (index === nextMain) {
        nextMain++;
        nextSub = 0;
        const heading = clean(main[2]);
        // A conclusion closes the sermon; it is not one of its points.
        current = NOT_A_POINT.test(heading) ? null : { heading, points: [] };
        if (current) outline.push(current);
        continue;
      }
      if (index >= 0 && index < nextMain) continue; // repeated heading (e.g. page header)
    }

    const sub = line.match(/^([A-H])[.)]\s+(.{3,100})$/);
    if (sub && current && sub[1].charCodeAt(0) - 65 === nextSub) {
      nextSub++;
      current.points.push(clean(sub[2]));
    }
  }

  return outline.length >= 2 ? outline : null;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z']{3,}/g) ?? []);
function overlap(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/**
 * Use the sermon's own headings. Where the sermon has no lettered sub-points under
 * a heading, borrow the engine's points from its best-matching outline item.
 */
export function applyOutline(generated: BriefContent["outline"], detected: DetectedOutline): BriefContent["outline"] {
  return detected.map((part, i) => {
    if (part.points.length) return part;
    const match =
      generated
        .map((g) => ({ g, score: overlap(g.heading, part.heading) }))
        .sort((a, b) => b.score - a.score)
        .find((m) => m.score >= 0.3)?.g ?? (generated.length === detected.length ? generated[i] : undefined);
    return { heading: part.heading, points: match?.points ?? [] };
  });
}

const SCRIPTURE_LINE = /^[1-3]?\s?[A-Z][a-z]+\.?\s+\d{1,3}(?::[\d\s,:–—-]*)?$/;

/**
 * The opening sentences of the sermon's own conclusion (a "Conclusion" heading),
 * up to about maxWords. The preacher's summary of their message, word for word.
 */
export function detectConclusion(sourceText: string, maxWords = 70): string | null {
  const lines = sourceText.split("\n").map((l) => l.trim());
  const start = lines.findIndex((l) => /^(?:[IVXl1|]{1,4}[.)]\s+)?conclusion:?$/i.test(l));
  if (start < 0) return null;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    if (SCRIPTURE_LINE.test(line)) break; // the closing passage starts
    body.push(line);
  }
  const sentences = body.join(" ").replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["'”’]*/g) ?? [];
  const picked: string[] = [];
  let count = 0;
  for (const sentence of sentences) {
    const n = sentence.trim().split(/\s+/).length;
    if (picked.length && count + n > maxWords) break;
    picked.push(sentence.trim());
    count += n;
  }
  return picked.length ? picked.join(" ") : null;
}
