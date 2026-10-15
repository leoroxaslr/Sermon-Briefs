import "server-only";
import { config } from "../config";
import { tavilySettings } from "../settings";
import { BriefContentSchema, type BriefContent, type BriefOptions } from "../types";
import { AUDIENCE_GUIDANCE, type BriefMeta } from "./shared";

/** An error whose message is safe and useful to show in the UI. */
export class TavilyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TavilyError";
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "Tavily rejected the request.",
  401: "Tavily rejected the API key. Check it in Settings.",
  429: "Tavily is rate-limiting requests right now. Try again in a minute.",
  432: "Your Tavily plan's credit limit has been reached.",
  433: "Your Tavily pay-as-you-go limit has been reached.",
};

async function tavilyFetch(path: string, init: RequestInit = {}, apiKey = tavilySettings().apiKey): Promise<Response> {
  if (!apiKey) throw new TavilyError("Tavily isn't connected. Add your API key in Settings.");
  let res: Response;
  try {
    res = await fetch(`${config.tavily.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch {
    throw new TavilyError("Couldn't reach Tavily. Check your internet connection.");
  }
  if (!res.ok && res.status !== 202) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: { error?: string } | string };
      detail = typeof body.detail === "string" ? body.detail : (body.detail?.error ?? "");
    } catch {
      // body wasn't JSON
    }
    const base = STATUS_MESSAGES[res.status] ?? `Tavily returned an error (HTTP ${res.status}).`;
    throw new TavilyError(detail && res.status === 400 ? `${base} ${detail}` : base, res.status);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Output schema: only request the sections the user turned on, to save credits.
// ---------------------------------------------------------------------------

type SchemaProp = {
  type: "string" | "array" | "object" | "integer" | "number";
  description: string;
  items?: SchemaProp;
  properties?: Record<string, SchemaProp>;
  required?: string[];
};

const str = (description: string): SchemaProp => ({ type: "string", description });
const list = (description: string, item: string): SchemaProp => ({
  type: "array",
  description,
  items: str(item),
});

function buildOutputSchema(options: BriefOptions) {
  const s = options.sections;
  const properties: Record<string, SchemaProp> = {
    title: str("The sermon's title, taken from the material. If none is given, write a short fitting title."),
    speaker: str("The preacher's name if the material states it, otherwise an empty string."),
    date: str("The date the sermon was preached if stated, otherwise an empty string."),
    series: str("The sermon series name if stated, otherwise an empty string."),
    scriptures: list(
      "The main Bible passages the sermon is built on, most important first. At most 5.",
      "A Bible reference such as 'Joshua 1:6-9'.",
    ),
    bigIdea: str("The single main point of the sermon in one memorable sentence of at most 25 words."),
    summary: str("A 2-3 sentence summary of the message, at most 70 words."),
  };
  if (s.outline) {
    properties.outline = {
      type: "array",
      description: "The sermon's main movements in order. 3 to 5 sections.",
      items: {
        type: "object",
        description: "One section of the sermon.",
        properties: {
          heading: str("A short heading for this section, at most 8 words."),
          points: list("1 to 3 supporting points for this section.", "One supporting point, at most 20 words."),
        },
        required: ["heading", "points"],
      },
    };
  }
  if (s.quotes) {
    properties.keyQuotes = list(
      "2 to 3 memorable lines from the sermon, quoted as closely to the original wording as possible.",
      "One quote, at most 30 words, without surrounding quotation marks.",
    );
  }
  if (s.takeaways) {
    properties.takeaways = list("3 to 4 practical takeaways.", "One takeaway, at most 22 words.");
  }
  if (s.reflection) {
    properties.reflectionQuestions = list(
      "3 to 4 open-ended reflection or discussion questions drawn from this sermon.",
      "One question, at most 25 words.",
    );
  }
  if (s.application) {
    properties.application = str("One concrete challenge or action step for the coming week, at most 40 words.");
  }
  if (s.prayer) {
    properties.prayer = str("A short closing prayer that responds to the message, at most 60 words.");
  }
  return { properties, required: Object.keys(properties) };
}

function buildInput(options: BriefOptions, meta: BriefMeta): string {
  const known = [
    meta.title && `Title: ${meta.title}`,
    meta.speaker && `Speaker: ${meta.speaker}`,
    meta.sermonDate && `Date: ${meta.sermonDate}`,
    meta.series && `Series: ${meta.series}`,
  ].filter(Boolean);
  return [
    "Create a one-page sermon brief from the attached sermon material (slides, notes, and/or transcript).",
    "Base every part of the brief on what the preacher actually said in the attached file.",
    "Use outside sources only to confirm Bible references; do not add ideas the sermon does not contain.",
    "Keep the preacher's voice and wording where you can. Write in plain, warm language.",
    "Refer to the preacher by name or as 'the pastor'; never guess their pronouns or gender.",
    "Lines under '[Text in images]' were recovered by OCR and may contain small recognition errors.",
    `Audience: ${AUDIENCE_GUIDANCE[options.audience]}`,
    known.length ? `Known details (use these exactly): ${known.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Trim to Tavily's per-file word limit, keeping whole lines. */
function fitToWordLimit(text: string, maxWords: number): { text: string; truncated: boolean } {
  let count = 0;
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    count += line.split(/\s+/).filter(Boolean).length;
    if (count > maxWords) return { text: kept.join("\n"), truncated: true };
    kept.push(line);
  }
  return { text, truncated: false };
}

type ResearchStatus = {
  request_id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  content?: unknown;
  usage?: { credits?: number };
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replace exotic spaces and hyphens (e.g. U+202F in "Joshua 1:9") that some fonts render badly. */
function normalizeWhitespace(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
      .replace(/[\u2010\u2011]/g, "-") // non-breaking hyphens, e.g. "1:2‑3"
      .trim();
  }
  if (Array.isArray(value)) return value.map(normalizeWhitespace);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeWhitespace(v)]));
  }
  return value;
}

export async function generateWithTavily(
  sourceText: string,
  options: BriefOptions,
  meta: BriefMeta,
  onProgress: (message: string) => void,
): Promise<{ content: BriefContent; credits: number | null; warnings: string[] }> {
  const warnings: string[] = [];
  const fitted = fitToWordLimit(sourceText, config.tavily.maxWords);
  if (fitted.truncated) {
    warnings.push("The material was longer than Tavily accepts, so only the first part was used.");
  }

  onProgress("Sending to Tavily Research…");
  const created = await tavilyFetch("/research", {
    method: "POST",
    body: JSON.stringify({
      input: buildInput(options, meta),
      model: tavilySettings().model,
      output_schema: buildOutputSchema(options),
      output_length: "short",
      // Soft preference: when Tavily checks a verse, favour well-known Bible sites.
      include_domains: ["biblegateway.com", "bible.com", "esv.org", "biblehub.com"],
      files: [
        {
          name: "sermon.md",
          type: "base64",
          data: Buffer.from(fitted.text, "utf8").toString("base64"),
        },
      ],
    }),
  });
  const { request_id: requestId } = (await created.json()) as { request_id: string };
  if (!requestId) throw new TavilyError("Tavily didn't return a task id.");

  const started = Date.now();
  while (Date.now() - started < config.tavily.timeoutMs) {
    await sleep(config.tavily.pollIntervalMs);
    const seconds = Math.round((Date.now() - started) / 1000);
    onProgress(`Tavily is writing your brief… (${seconds}s)`);

    const res = await tavilyFetch(`/research/${encodeURIComponent(requestId)}?include_usage=true`);
    const task = (await res.json()) as ResearchStatus;
    if (task.status === "failed") {
      throw new TavilyError(`Tavily couldn't finish the brief${task.error ? `: ${task.error}` : "."}`);
    }
    if (task.status !== "completed") continue;

    let content = task.content;
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
      } catch {
        throw new TavilyError("Tavily returned text instead of a structured brief.");
      }
    }
    const parsed = BriefContentSchema.safeParse(normalizeWhitespace(content));
    if (!parsed.success) throw new TavilyError("Tavily's response didn't match the brief format.");
    return { content: parsed.data, credits: task.usage?.credits ?? null, warnings };
  }
  throw new TavilyError("Tavily took too long to respond. Try again, or use the free local engine.");
}

export type TavilyUsage = {
  plan: string;
  planUsage: number;
  planLimit: number | null;
  keyUsage: number;
  keyLimit: number | null;
  researchUsage: number;
};

/** Plan usage for the saved key, or for `apiKey` when testing one before saving it. */
export async function getTavilyUsage(apiKey?: string): Promise<TavilyUsage> {
  const res = await tavilyFetch("/usage", { signal: AbortSignal.timeout(8_000) }, apiKey);
  const body = (await res.json()) as {
    key?: { usage?: number; limit?: number | null; research_usage?: number };
    account?: { current_plan?: string; plan_usage?: number; plan_limit?: number | null };
  };
  return {
    plan: body.account?.current_plan ?? "Tavily",
    planUsage: body.account?.plan_usage ?? 0,
    planLimit: body.account?.plan_limit ?? null,
    keyUsage: body.key?.usage ?? 0,
    keyLimit: body.key?.limit ?? null,
    researchUsage: body.key?.research_usage ?? 0,
  };
}
