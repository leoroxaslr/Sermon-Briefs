import type { SourceKind } from "../types";
import type { ExtractedSource } from "./types";

/** Decode a text upload, honouring UTF-8/UTF-16 byte-order marks. */
export function decodeText(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return buffer.toString("utf8").replace(/^﻿/, "");
}

const TIMESTAMP = /\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?/;
const CUE_TIMING = new RegExp(`^${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}.*$`);

/** True when the text looks like captions (SRT/VTT) or a timestamped auto-transcript. */
export function looksTimestamped(text: string): boolean {
  const lines = text.split(/\r?\n/).slice(0, 200);
  const stamped = lines.filter((l) => CUE_TIMING.test(l.trim()) || /^\[?\(?\d{1,2}:\d{2}/.test(l.trim()));
  return stamped.length >= 3;
}

/**
 * Strip caption scaffolding (WEBVTT headers, cue numbers, timings, voice tags)
 * and re-flow the remaining words into readable paragraphs.
 */
export function cleanTranscript(raw: string): string[] {
  const words: string[] = [];
  let previous = "";
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line === "WEBVTT" || /^(NOTE|STYLE|REGION)\b/.test(line)) continue;
    if (/^\d+$/.test(line) || CUE_TIMING.test(line)) continue;
    line = line
      .replace(/^\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*/, "") // leading "0:42" or "[00:00:42]"
      .replace(/<\/?[^>]+>/g, "") // <v Speaker>, <c>, <i> tags
      .replace(/\[(music|applause|laughter|inaudible)\]/gi, "")
      .trim();
    // Auto-captions repeat the previous line while it scrolls; skip exact repeats.
    if (!line || line === previous) continue;
    previous = line;
    words.push(line);
  }

  // Re-flow into paragraphs of roughly 4-6 sentences so later scoring has natural units.
  const sentences = words.join(" ").replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const sentence of sentences) {
    current.push(sentence.trim());
    if (current.length >= 5 || current.join(" ").length > 700) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs;
}

export function extractPlainText(text: string, name: string, kind: SourceKind): ExtractedSource {
  const isTranscript = kind === "transcript" || looksTimestamped(text);
  const lines = isTranscript
    ? cleanTranscript(text)
    : text
        .split(/\n\s*\n|\r\n\s*\r\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
  return {
    name,
    kind: isTranscript ? "transcript" : kind,
    sections: [{ label: isTranscript ? "Transcript" : "Text", lines }],
  };
}
