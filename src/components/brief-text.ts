import { formatSermonDate } from "@/lib/format";
import { SECTION_LABELS, type BriefContent, type BriefOptions } from "@/lib/types";

/** Plain-text version of a brief, for pasting into emails, bulletins or group chats. */
export function briefAsText(content: BriefContent, options: BriefOptions): string {
  const s = options.sections;
  const lines: string[] = [content.title.toUpperCase()];
  const meta = [content.speaker, formatSermonDate(content.date), content.series].filter(Boolean).join(" · ");
  if (meta) lines.push(meta);
  if (content.scriptures.length) lines.push(`Scripture: ${content.scriptures.join("; ")}`);
  if (content.bigIdea) lines.push("", `BIG IDEA: ${content.bigIdea}`);
  if (content.summary) lines.push("", content.summary);

  const section = (title: string, items: string[]) => {
    if (items.length) lines.push("", title.toUpperCase(), ...items);
  };
  if (s.outline) {
    section(
      SECTION_LABELS.outline,
      content.outline.flatMap((part, i) => [`${i + 1}. ${part.heading}`, ...part.points.map((p) => `   - ${p}`)]),
    );
  }
  if (s.quotes) section(SECTION_LABELS.quotes, content.keyQuotes.map((q) => `"${q}"`));
  if (s.takeaways) section(SECTION_LABELS.takeaways, content.takeaways.map((t) => `- ${t}`));
  if (s.reflection) section(SECTION_LABELS.reflection, content.reflectionQuestions.map((q, i) => `${i + 1}. ${q}`));
  if (s.application && content.application) section(SECTION_LABELS.application, [content.application]);
  if (s.prayer && content.prayer) section(SECTION_LABELS.prayer, [content.prayer]);
  return lines.join("\n");
}
