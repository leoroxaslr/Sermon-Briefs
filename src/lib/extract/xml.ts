/**
 * Tiny regex-based helpers for the OOXML we read. We only pull out text and
 * relationship ids, so a full XML parser (and its XXE surface) isn't needed.
 */

export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

/** Text of each <a:p> paragraph inside a DrawingML fragment. */
export function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const para of xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? []) {
    const runs = para.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) ?? [];
    const text = runs
      .map((r) => decodeXml(r.replace(/<a:t(?:\s[^>]*)?>|<\/a:t>/g, "")))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

export type Relationship = { id: string; type: string; target: string };

export function relationships(relsXml: string): Relationship[] {
  return (relsXml.match(/<Relationship\b[^>]*>/g) ?? []).map((tag) => ({
    id: attr(tag, "Id") ?? "",
    type: attr(tag, "Type") ?? "",
    target: attr(tag, "Target") ?? "",
  }));
}

/** Resolve a relationship target (e.g. "../media/image1.png") against its part's folder. */
export function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}
