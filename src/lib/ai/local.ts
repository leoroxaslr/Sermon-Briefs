import type { BriefContent, BriefOptions } from "../types";
import type { BriefMeta } from "./shared";

/**
 * Free, offline brief generator. It is extractive: it picks the strongest lines
 * from the material rather than writing new prose, so it never invents content.
 * It parses the Markdown produced by `renderSources` in ../extract.
 */

type Section = { label: string; title: string; lines: string[]; notes: string[]; images: string[] };

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let mode: "lines" | "notes" | "images" = "lines";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("# Source:")) continue;
    const heading = line.match(/^## ([^:]+)(?::\s*(.*))?$/);
    if (heading) {
      current = { label: heading[1], title: heading[2] ?? "", lines: [], notes: [], images: [] };
      sections.push(current);
      mode = "lines";
      continue;
    }
    if (line === "[Speaker notes]") mode = "notes";
    else if (line === "[Text in images]") mode = "images";
    else if (current) current[mode].push(line);
  }
  // OCR breaks lines wherever the slide wrapped; re-join them into sentences.
  for (const section of sections) section.images = splitSentences(section.images.join(" "));
  return sections;
}

// ---------------------------------------------------------------------------
// Scripture references
// ---------------------------------------------------------------------------

const BOOKS: [string, string][] = [
  ["Genesis", "Gen|Gn"], ["Exodus", "Exod|Exo|Ex"], ["Leviticus", "Lev|Lv"], ["Numbers", "Num|Nm"],
  ["Deuteronomy", "Deut|Dt"], ["Joshua", "Josh|Jos"], ["Judges", "Judg|Jdg"], ["Ruth", "Ru"],
  ["1 Samuel", "1 Sam|1Sam|1 Sm"], ["2 Samuel", "2 Sam|2Sam|2 Sm"], ["1 Kings", "1 Kgs|1Kgs"],
  ["2 Kings", "2 Kgs|2Kgs"], ["1 Chronicles", "1 Chr|1Chr"], ["2 Chronicles", "2 Chr|2Chr"],
  ["Ezra", "Ezr"], ["Nehemiah", "Neh"], ["Esther", "Esth|Est"], ["Job", "Jb"], ["Psalms", "Psalm|Ps|Psa"],
  ["Proverbs", "Prov|Prv|Pr"], ["Ecclesiastes", "Eccl|Ecc"], ["Song of Songs", "Song of Solomon|Song"],
  ["Isaiah", "Isa|Is"], ["Jeremiah", "Jer"], ["Lamentations", "Lam"], ["Ezekiel", "Ezek|Ezk"],
  ["Daniel", "Dan|Dn"], ["Hosea", "Hos"], ["Joel", "Jl"], ["Amos", "Am"], ["Obadiah", "Obad|Ob"],
  ["Jonah", "Jon"], ["Micah", "Mic"], ["Nahum", "Nah"], ["Habakkuk", "Hab"], ["Zephaniah", "Zeph"],
  ["Haggai", "Hag"], ["Zechariah", "Zech"], ["Malachi", "Mal"], ["Matthew", "Matt|Mt"], ["Mark", "Mk|Mrk"],
  ["Luke", "Lk"], ["John", "Jn|Jhn"], ["Acts", "Act"], ["Romans", "Rom|Rm"],
  ["1 Corinthians", "1 Cor|1Cor"], ["2 Corinthians", "2 Cor|2Cor"], ["Galatians", "Gal"],
  ["Ephesians", "Eph"], ["Philippians", "Phil|Php"], ["Colossians", "Col"],
  ["1 Thessalonians", "1 Thess|1Thess|1 Th"], ["2 Thessalonians", "2 Thess|2Thess|2 Th"],
  ["1 Timothy", "1 Tim|1Tim"], ["2 Timothy", "2 Tim|2Tim"], ["Titus", "Tit"], ["Philemon", "Phlm|Philem"],
  ["Hebrews", "Heb"], ["James", "Jas|Jms"], ["1 Peter", "1 Pet|1Pet|1 Pt"], ["2 Peter", "2 Pet|2Pet|2 Pt"],
  ["1 John", "1 Jn|1Jn|1John"], ["2 John", "2 Jn|2Jn"], ["3 John", "3 Jn|3Jn"], ["Jude", "Jud"],
  ["Revelation", "Rev|Revelations"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
const BOOK_LOOKUP = new Map<string, string>();
for (const [name, aliases] of BOOKS) {
  for (const alias of [name, ...aliases.split("|")]) BOOK_LOOKUP.set(alias.toLowerCase().replace(/\s+/g, ""), name);
}
// Longest aliases first so "1 John" wins over "John".
const BOOK_PATTERN = [...BOOK_LOOKUP.keys()]
  .sort((a, b) => b.length - a.length)
  .map((k) => escape(k.replace(/^(\d)/, "$1 ")))
  .join("|");
const SCRIPTURE = new RegExp(
  `\\b(${BOOK_PATTERN})\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?\\b`,
  "gi",
);

export function findScriptures(text: string): string[] {
  const counts = new Map<string, { ref: string; count: number; first: number }>();
  for (const match of text.matchAll(SCRIPTURE)) {
    const book = BOOK_LOOKUP.get(match[1].toLowerCase().replace(/\s+/g, ""));
    if (!book) continue;
    const [, , chapter, verse, end] = match;
    // A bare "Mark 3" or "Acts 2" without a verse is often just prose; require a verse
    // unless the book name is unambiguous and long.
    if (!verse && book.length < 6) continue;
    const ref = `${book === "Psalms" ? "Psalm" : book} ${chapter}${verse ? `:${verse}` : ""}${end ? `-${end}` : ""}`;
    const entry = counts.get(ref) ?? { ref, count: 0, first: match.index ?? 0 };
    entry.count++;
    counts.set(ref, entry);
  }
  const refs = [...counts.values()];
  return refs
    .filter((e) => e.ref.includes(":") || !refs.some((o) => o.ref.startsWith(`${e.ref}:`)))
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, 5)
    .map((e) => e.ref);
}

// ---------------------------------------------------------------------------
// Sentence scoring
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below between
  both but by can could did do does doing down during each few for from further had has have having he her here
  hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now
  of off on once only or other our ours ourselves out over own same she should so some such than that the their
  theirs them themselves then there these they this those through to too under until up very was we were what
  when where which while who whom why will with would you your yours yourself yourselves gonna wanna yeah okay
  really thing things like get got go going know say said one also us oh well right kind lot um uh just way`
    .split(/\s+/)
    .filter(Boolean),
);

const CUE_PHRASES =
  /\b(big idea|main point|the point is|here's the thing|remember|this week|today|we need to|you need to|we must|you can|god wants|jesus|grace|faith|hope|love|trust|challenge|invite you|let's|imagine)\b/i;
const IMPERATIVE_START =
  /^(be|choose|give|take|trust|pray|read|remember|let|stop|start|go|ask|seek|serve|love|forgive|rest|believe|follow|look|find|make|keep|practice|spend|invite|share|thank|commit|surrender|don't|do)\b/i;
const HOUSEKEEPING =
  /^(good (morning|evening)|welcome|let's (open|pray|turn|stand|bow)|(please )?(turn|open) (with me|your bibles?)|this (week|morning) we're (talking|looking)|today we're (talking|starting|looking))/i;
const SCRIPTURE_ONLY = /^[1-3]?\s?[A-Za-z]+\.?\s+\d{1,3}(:\d{1,3}(-\d{1,3})?)?\.?$/;
const NOISE_LABELS = /^(welcome|announcements?|questions?|thank you|thanks|amen|prayer|worship|offering|next steps?|connect)\.?$/i;

const tokenize = (s: string) =>
  (s.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));

function splitSentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type Scored = { text: string; score: number; order: number; words: number };

function scoreSentences(sentences: string[]): Scored[] {
  const freq = new Map<string, number>();
  for (const s of sentences) for (const w of new Set(tokenize(s))) freq.set(w, (freq.get(w) ?? 0) + 1);
  return sentences.map((text, order) => {
    const tokens = tokenize(text);
    const words = text.split(/\s+/).length;
    let score = tokens.reduce((sum, w) => sum + Math.log(1 + (freq.get(w) ?? 0)), 0) / Math.max(tokens.length, 4);
    if (CUE_PHRASES.test(text)) score *= 1.35;
    if (words < 6 || words > 40) score *= 0.4;
    if (/^(so|and|but|um|uh|okay|yeah)\b/i.test(text)) score *= 0.75;
    if (HOUSEKEEPING.test(text)) score *= 0.25;
    return { text, score, order, words };
  });
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clip = (s: string, max: number) => {
  const parts = s.split(/\s+/);
  return parts.length <= max ? s : `${parts.slice(0, max).join(" ").replace(/[,;:]$/, "")}…`;
};
const tidy = (s: string) =>
  s
    .replace(/^(?:[-•*–]\s*|\d{1,2}[.)]\s+)/, "")
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function topDistinct(items: Scored[], count: number, exclude: Set<string>): Scored[] {
  const picked: Scored[] = [];
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    const key = item.text.toLowerCase();
    if (exclude.has(key)) continue;
    if (picked.some((p) => overlap(p.text, item.text) > 0.6)) continue;
    picked.push(item);
    exclude.add(key);
    if (picked.length === count) break;
  }
  return picked;
}

function overlap(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const SPEAKER = /^(?:by\s+)?((?:pastor|ps\.?|rev\.?|reverend|bishop|elder|dr\.?|father|fr\.?|minister)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,2})$/i;
const SERIES = /\bseries,?\s+(?:called\s+|titled\s+)?["“]?([A-Z][\w']*(?:\s+(?:[A-Z][\w']*|and|of|the|in|to|for|a))*)/;

function detectSpeaker(sections: Section[]): string {
  for (const s of sections.slice(0, 3)) {
    for (const line of s.lines) {
      const match = line.trim().match(SPEAKER);
      if (match) return match[1];
    }
  }
  return "";
}

function detectSeries(text: string): string {
  return text.match(SERIES)?.[1]?.replace(/\s+(and|of|the|in|to|for|a)$/i, "").trim() ?? "";
}

// ---------------------------------------------------------------------------
// Brief assembly
// ---------------------------------------------------------------------------

export function generateLocally(
  sourceText: string,
  options: BriefOptions,
  meta: BriefMeta,
): { content: BriefContent; warnings: string[] } {
  const sections = parseSections(sourceText);
  const isDeck = sections.some((s) => s.label.startsWith("Slide") || s.label.startsWith("Page"));

  const allText = sections.flatMap((s) => [s.title, ...s.lines, ...s.notes, ...s.images]).join("\n");
  const sentences = splitSentences(
    sections.flatMap((s) => [...s.lines, ...s.notes, ...s.images].map((l) => (/[.!?]$/.test(l) ? l : `${l}.`))).join(" "),
  ).map(tidy);
  const scored = scoreSentences(sentences).filter((s) => s.words >= 4 && !HOUSEKEEPING.test(s.text));
  const used = new Set<string>();

  const scriptures = findScriptures(allText);

  // Title: user-supplied, else the first slide title, else the first short line.
  const firstTitle = sections.find((s) => s.title && !NOISE_LABELS.test(s.title))?.title;
  const firstShortLine = isDeck
    ? sections.flatMap((s) => s.lines).find((l) => words(l) >= 2 && words(l) <= 10)
    : undefined;
  const topic = allText.match(/\b(?:talking|speaking|preaching|teaching) (?:about|on) ([\w' ]{3,40}?)[.,!?]/i)?.[1];
  const title =
    meta.title ||
    tidy(firstTitle ?? firstShortLine ?? "") ||
    (topic ? capitalize(topic.trim()) : "") ||
    (scriptures[0] ? `A message from ${scriptures[0]}` : "Untitled sermon");

  const bigIdeaCandidate =
    scored.find((s) => /\b(big idea|main point|the point is|bottom line)\b/i.test(s.text) && s.words <= 35) ??
    topDistinct(scored.filter((s) => s.words >= 7 && s.words <= 28), 1, new Set())[0];
  const bigIdea = bigIdeaCandidate
    ? capitalize(
        clip(
          bigIdeaCandidate.text.replace(
            /^.*?\b(big idea|main point|bottom line)(\s+(is|was))?(\s+(this|that))?\s*[:,–-]?\s*/i,
            "",
          ),
          30,
        ),
      )
    : "";
  if (bigIdeaCandidate) used.add(bigIdeaCandidate.text.toLowerCase());

  const prose = scored.filter((s) => s.words >= 8);
  const summary = topDistinct(prose.length >= 3 ? prose : scored, 3, used)
    .sort((a, b) => a.order - b.order)
    .map((s) => clip(s.text, 30))
    .join(" ");

  // Outline: slide titles for decks; evenly split movements for transcripts.
  const outline: BriefContent["outline"] = [];
  if (options.sections.outline) {
    if (isDeck) {
      const seen = new Set<string>([title.toLowerCase()]);
      for (const section of sections) {
        const heading = tidy(section.title);
        if (!heading || NOISE_LABELS.test(heading) || seen.has(heading.toLowerCase()) || words(heading) > 12) continue;
        seen.add(heading.toLowerCase());
        const points = [...section.lines, ...section.images.flatMap((t) => t.split("\n"))]
          .map(tidy)
          .filter((l) => words(l) >= 3 && l.toLowerCase() !== heading.toLowerCase())
          .slice(0, 3)
          .map((l) => clip(l, 20));
        outline.push({ heading: clip(heading, 8), points });
        if (outline.length === 5) break;
      }
    }
    if (outline.length < 2 && scored.length >= 8) {
      outline.length = 0;
      const parts = 4;
      const size = Math.ceil(scored.length / parts);
      for (let i = 0; i < parts; i++) {
        const chunk = scored.slice(i * size, (i + 1) * size);
        if (!chunk.length) continue;
        // Prefer a short sentence as the heading so it reads like one.
        const short = chunk.filter((s) => s.words <= 10);
        const lead = topDistinct(short.length ? short : chunk, 1, new Set())[0];
        const rest = lead ? topDistinct(chunk, 2, new Set([lead.text.toLowerCase()])) : [];
        if (!lead || rest.length === 0) continue;
        outline.push({
          heading: clip(lead.text.replace(/[.!?]+$/, ""), 8),
          points: rest.sort((a, b) => a.order - b.order).map((s) => clip(s.text, 20)),
        });
      }
    }
  }

  const quoted = [...allText.matchAll(/["“]([^"”]{25,220})["”]/g)].map((m) => tidy(m[1]));
  // A slide whose words are mostly in a picture is usually a quote graphic.
  const imageQuotes = sections
    .map((s) => s.images.join(" "))
    .filter((t) => words(t) >= 6 && words(t) <= 35 && !/^[\d\s:]+$/.test(t) && !SCRIPTURE_ONLY.test(t));
  const keyQuotes = options.sections.quotes
    ? [
        ...new Set([
          ...quoted.filter((q) => words(q) <= 35),
          ...imageQuotes,
          ...topDistinct(
            scored.filter((s) => s.words >= 6 && s.words <= 22 && !HOUSEKEEPING.test(s.text) && !findScriptures(s.text).length),
            3,
            used,
          ).map((s) => s.text),
        ]),
      ].slice(0, 3)
    : [];

  const actionable = scored.filter(
    (s) => IMPERATIVE_START.test(s.text) || /\b(we|you) (need to|must|can|should|get to)\b/i.test(s.text),
  );
  const takeaways = options.sections.takeaways
    ? [...topDistinct(actionable, 4, used), ...topDistinct(scored, 4, used)].slice(0, 4).map((s) => clip(s.text, 24))
    : [];

  const reflectionQuestions = options.sections.reflection
    ? buildQuestions(scriptures, outline, bigIdea, options.audience)
    : [];

  const weekly = scored.filter((s) => /\b(this week|challenge|each day|every day|every morning)\b/i.test(s.text));
  const firstAction =
    weekly.find((s) => (IMPERATIVE_START.test(s.text) || /\b(write|choose|take|spend|read)\b/i.test(s.text)) && s.words >= 6 && s.words <= 30) ??
    actionable.find((s) => s.words >= 6 && s.words <= 30);
  const application = options.sections.application
    ? firstAction
      ? capitalize(firstAction.text.replace(/^(so|and|then)\s+/i, ""))
      : `This week, set aside ten minutes each day to re-read ${scriptures[0] ?? "this week's passage"} and ask God to show you one way to live it out.`
    : "";

  const prayer = options.sections.prayer
    ? `Lord, thank you for speaking to us through ${scriptures[0] ?? "your Word"}. ${
        bigIdea ? `Help us hold on to this truth: ${bigIdea.replace(/[.!?…]+$/, "")}. ` : ""
      }Give us courage to live it out this week. Amen.`
    : "";

  return {
    content: {
      title,
      speaker: meta.speaker || detectSpeaker(sections),
      date: meta.sermonDate,
      series: meta.series || detectSeries(allText),
      scriptures,
      bigIdea,
      summary,
      outline,
      keyQuotes,
      takeaways,
      reflectionQuestions,
      application,
      prayer,
    },
    warnings: [
      "Made with the free local engine, which picks lines from your material instead of writing new ones. Review it, and edit anything that reads awkwardly.",
    ],
  };
}

function buildQuestions(
  scriptures: string[],
  outline: BriefContent["outline"],
  bigIdea: string,
  audience: BriefOptions["audience"],
): string[] {
  const questions: string[] = [];
  if (scriptures[0]) questions.push(`Read ${scriptures[0]} again. What stands out to you most, and why?`);
  if (bigIdea) questions.push(`The big idea was: "${bigIdea.replace(/[.!?…]+$/, "")}." Where do you see this in your own life right now?`);
  const headings = outline.map((o) => o.heading.replace(/[.!?…]+$/, "")).filter((h) => words(h) <= 6);
  if (headings.length >= 2) {
    questions.push(`Which part of the message (${headings.slice(0, 4).join(", ")}) speaks most to where you are right now?`);
  }
  questions.push(
    audience === "leaders"
      ? "How could this message shape the way you lead or serve others?"
      : audience === "youth"
        ? "What's one thing from this message you could share with a friend?"
        : "What is one step you sense God inviting you to take after this message?",
  );
  return questions.slice(0, 4);
}
