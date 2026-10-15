import { z } from "zod";

/** Shared between server and client. No server-only imports here. */

export const SECTION_KEYS = [
  "outline",
  "quotes",
  "takeaways",
  "reflection",
  "application",
  "prayer",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  outline: "Sermon outline",
  quotes: "Key quotes",
  takeaways: "Takeaways",
  reflection: "Reflection questions",
  application: "This week's challenge",
  prayer: "Closing prayer",
};

export const AUDIENCES = ["congregation", "small-group", "youth", "leaders"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  congregation: "Congregation",
  "small-group": "Small group",
  youth: "Youth",
  leaders: "Leaders & staff",
};

export const ENGINES = ["tavily", "local"] as const;
export type Engine = (typeof ENGINES)[number];

export const BriefOptionsSchema = z.object({
  engine: z.enum(ENGINES).default("tavily"),
  audience: z.enum(AUDIENCES).default("congregation"),
  sections: z
    .object({
      outline: z.boolean().default(true),
      quotes: z.boolean().default(true),
      takeaways: z.boolean().default(true),
      reflection: z.boolean().default(true),
      application: z.boolean().default(true),
      prayer: z.boolean().default(false),
    })
    .prefault({}),
});
export type BriefOptions = z.infer<typeof BriefOptionsSchema>;

export const OutlinePointSchema = z.object({
  heading: z.string().default(""),
  points: z.array(z.string()).default([]),
});

/** The one-page brief itself. Lenient parsing: AI output may omit fields. */
export const BriefContentSchema = z.object({
  title: z.string().default("Untitled sermon"),
  speaker: z.string().default(""),
  date: z.string().default(""),
  series: z.string().default(""),
  scriptures: z.array(z.string()).default([]),
  bigIdea: z.string().default(""),
  summary: z.string().default(""),
  outline: z.array(OutlinePointSchema).default([]),
  keyQuotes: z.array(z.string()).default([]),
  takeaways: z.array(z.string()).default([]),
  reflectionQuestions: z.array(z.string()).default([]),
  application: z.string().default(""),
  prayer: z.string().default(""),
});
export type BriefContent = z.infer<typeof BriefContentSchema>;

export const BRIEF_STATUSES = ["queued", "extracting", "generating", "ready", "failed"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export type SourceFileInfo = {
  name: string;
  kind: SourceKind;
  size: number;
};

export type SourceKind = "pptx" | "pdf" | "docx" | "image" | "transcript" | "text" | "pasted";

export type ExtractionStats = {
  slides: number;
  pages: number;
  imagesScanned: number;
  words: number;
};

/** Details the user typed in (or saved in the editor); these always win over detection. */
export type BriefMeta = {
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
};

export type BriefRecord = {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  status: BriefStatus;
  progress: string;
  error: string | null;
  engine: Engine;
  engineUsed: Engine | null;
  options: BriefOptions;
  meta: BriefMeta;
  sources: SourceFileInfo[];
  stats: ExtractionStats | null;
  extractedText: string;
  content: BriefContent | null;
  /** Problems reading the uploads (kept across regenerations). */
  warnings: string[];
  /** Notes about how the current brief was written (replaced on each regeneration). */
  notices: string[];
  credits: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Lightweight row for dashboard lists (no large text columns). */
export type BriefSummary = Pick<
  BriefRecord,
  | "id"
  | "title"
  | "speaker"
  | "sermonDate"
  | "series"
  | "status"
  | "engineUsed"
  | "sources"
  | "credits"
  | "createdAt"
> & { bigIdea: string };

export const BriefPatchSchema = z.object({
  content: BriefContentSchema.optional(),
  options: BriefOptionsSchema.partial().optional(),
});
