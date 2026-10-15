import { SECTION_KEYS, type BriefContent, type BriefOptions, type SectionKey } from "./types";

/**
 * How much of a brief is in the sermon's own words. A word counts as "from the
 * sermon" when it sits inside some three-word run that also appears in the source
 * material; anything else is new wording. Pure functions, used on server and client.
 */

/** The share of new wording we aim to stay under. */
export const NEW_WORDING_TARGET = 0.1;

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

const normalizeWord = (w: string) => w.toLowerCase().replace(/’/g, "'");

export type SourceIndex = { trigrams: Set<string>; words: Set<string>; candidates: string[] };

export function buildSourceIndex(sourceText: string): SourceIndex {
  const prose = sourceText
    .split("\n")
    .filter((l) => !/^(#|\[(Text in images|Speaker notes)\])/.test(l.trim()))
    .join("\n");
  const tokens = (prose.match(WORD) ?? []).map(normalizeWord);
  const trigrams = new Set<string>();
  for (let i = 0; i + 2 < tokens.length; i++) trigrams.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);

  // Candidate lines for snapping: whole sentences, plus short standalone lines (slide bullets).
  const lines = prose
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const sentences = lines
    .join(" ")
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+["'”’]*/g) ?? [];
  const candidates = [
    ...sentences.map((s) => s.trim()),
    ...lines.filter((l) => !/[.!?]["'”’]?$/.test(l)),
  ].filter((s) => {
    const n = s.match(WORD)?.length ?? 0;
    return n >= 4 && n <= 40;
  });

  return { trigrams, words: new Set(tokens), candidates: [...new Set(candidates)] };
}

export type Segment = { text: string; isNew: boolean };

/** Split text into runs of sermon wording and new wording, preserving the original characters. */
export function segment(text: string, index: SourceIndex): Segment[] {
  const matches = [...text.matchAll(WORD)];
  const tokens = matches.map((m) => normalizeWord(m[0]));
  const covered = tokens.map(() => false);
  if (tokens.length < 3) {
    tokens.forEach((t, i) => (covered[i] = index.words.has(t)));
  } else {
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (index.trigrams.has(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)) {
        covered[i] = covered[i + 1] = covered[i + 2] = true;
      }
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = start + m[0].length;
    const isNew = !covered[i];
    // Attach the punctuation/space before a word to the run it belongs to.
    const piece = text.slice(cursor, end);
    const last = segments[segments.length - 1];
    if (last && last.isNew === isNew) last.text += piece;
    else segments.push({ text: piece, isNew });
    cursor = end;
  });
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (segments.length) segments[segments.length - 1].text += tail;
    else segments.push({ text: tail, isNew: false });
  }
  return segments;
}

function countNew(text: string, index: SourceIndex): { words: number; fresh: number } {
  let words = 0;
  let fresh = 0;
  for (const s of segment(text, index)) {
    const n = s.text.match(WORD)?.length ?? 0;
    words += n;
    if (s.isNew) fresh += n;
  }
  return { words, fresh };
}

/** The text of each section the brief prints, keyed like the section toggles. */
function sectionTexts(content: BriefContent, options: BriefOptions): Record<"core" | SectionKey, string[]> {
  const s = options.sections;
  return {
    core: [content.bigIdea, content.summary],
    outline: s.outline ? content.outline.flatMap((o) => [o.heading, ...o.points]) : [],
    quotes: s.quotes ? content.keyQuotes : [],
    takeaways: s.takeaways ? content.takeaways : [],
    reflection: s.reflection ? content.reflectionQuestions : [],
    application: s.application ? [content.application] : [],
    prayer: s.prayer ? [content.prayer] : [],
  };
}

export type Grounding = {
  /** Share of printed words (0-1) not found in the source. Title, names and references are excluded. */
  newWording: number;
  words: number;
  bySection: Partial<Record<"core" | SectionKey, number>>;
};

export function measure(content: BriefContent, options: BriefOptions, index: SourceIndex): Grounding {
  let words = 0;
  let fresh = 0;
  const bySection: Grounding["bySection"] = {};
  for (const [key, texts] of Object.entries(sectionTexts(content, options))) {
    const counts = texts.filter(Boolean).map((t) => countNew(t, index));
    const w = counts.reduce((n, c) => n + c.words, 0);
    const f = counts.reduce((n, c) => n + c.fresh, 0);
    if (w) bySection[key as keyof Grounding["bySection"]] = f / w;
    words += w;
    fresh += f;
  }
  return { newWording: words ? fresh / words : 0, words, bySection };
}

// ---------------------------------------------------------------------------
// Snapping paraphrases back to the sermon's own sentences
// ---------------------------------------------------------------------------

const STOP = new Set(
  "a an and are as at be but by for from has have he her his i in is it its of on or our so that the their them they this to us was we were what when which who will with you your".split(
    " ",
  ),
);
/** Crude stemmer so "prays", "praying" and "prayed" match "pray". */
const stem = (w: string) => w.replace(/(ing|ed|es|s|ly)$/, "").replace(/(.)\1$/, "$1");
const contentWords = (s: string) =>
  new Set(
    (s.match(WORD) ?? [])
      .map(normalizeWord)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );

function similarity(a: string, b: string): number {
  const ca = contentWords(a);
  const cb = contentWords(b);
  if (!ca.size || !cb.size) return 0;
  let shared = 0;
  for (const w of ca) if (cb.has(w)) shared++;
  return shared / (ca.size + cb.size - shared);
}

const freshShare = (text: string, index: SourceIndex) => {
  const { words, fresh } = countNew(text, index);
  return words ? fresh / words : 0;
};

/**
 * Replace a mostly-paraphrased line with the closest sentence from the source,
 * when a close enough one exists. Returns the original text otherwise.
 */
function snap(text: string, index: SourceIndex, opts: { maxFresh: number; minSimilarity: number; maxWords?: number }) {
  if (!text || freshShare(text, index) <= opts.maxFresh) return text;
  let best = "";
  let bestScore = 0;
  for (const candidate of index.candidates) {
    if (opts.maxWords && (candidate.match(WORD)?.length ?? 0) > opts.maxWords) continue;
    const score = similarity(text, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= opts.minSimilarity ? best.replace(/^["“]|["”]$/g, "").trim() : text;
}

const dedupe = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Pull lines that drifted from the sermon's wording back to it. Quotes must be
 * verbatim, so they snap readily; other lines only when they are mostly new words
 * and a clearly matching sentence exists. Questions and prayer are left alone:
 * they're new by nature.
 */
export function snapToSource(content: BriefContent, index: SourceIndex): BriefContent {
  return removeRepeats({
    ...content,
    bigIdea: snap(content.bigIdea, index, { maxFresh: 0.4, minSimilarity: 0.4, maxWords: 35 }),
    keyQuotes: dedupe(content.keyQuotes.map((q) => snap(q, index, { maxFresh: 0.1, minSimilarity: 0.3, maxWords: 45 }))),
    takeaways: dedupe(content.takeaways.map((t) => snap(t, index, { maxFresh: 0.4, minSimilarity: 0.25, maxWords: 30 }))),
    outline: content.outline.map((o) => ({
      ...o,
      points: dedupe(o.points.map((p) => snap(p, index, { maxFresh: 0.4, minSimilarity: 0.35, maxWords: 30 }))),
    })),
  });
}

const squash = (s: string) => (s.match(WORD) ?? []).map(normalizeWord).join(" ");
/** True when one line is the other, or contains it. */
const repeats = (a: string, b: string) => {
  const x = squash(a);
  const y = squash(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

/** A line should appear once on the page: drop quotes and takeaways that repeat an earlier section. */
function removeRepeats(content: BriefContent): BriefContent {
  const keyQuotes = content.keyQuotes.filter((q) => !repeats(q, content.bigIdea));
  const takeaways = content.takeaways.filter(
    (t) => !repeats(t, content.bigIdea) && !keyQuotes.some((q) => repeats(t, q)),
  );
  return { ...content, keyQuotes, takeaways };
}

export const SECTION_ORDER = ["core", ...SECTION_KEYS] as const;
