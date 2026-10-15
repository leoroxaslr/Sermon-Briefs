import "server-only";
import { generateLocally } from "./ai/local";
import { firstScripture } from "./ai/local";
import { applyOutline, detectConclusion, detectOutline } from "./ai/outline";
import { generateWithTavily } from "./ai/tavily";
import { config } from "./config";
import { getBrief, updateBrief } from "./db";
import { extractAll, type UploadedFile } from "./extract";
import { buildSourceIndex, measure, snapToSource } from "./grounding";
import { tavilyConfigured } from "./settings";
import type { BriefContent, BriefOptions, Engine } from "./types";

/** Below this, there's too little material to say anything useful. */
const MIN_WORDS = 40;

const errorMessage = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "Something went wrong while processing.";

/** Extract text from the uploads, then write the brief. Runs after the upload response is sent. */
export async function processBrief(id: string, files: UploadedFile[], pastedText: string): Promise<void> {
  const warnings: string[] = [];
  try {
    updateBrief(id, { status: "extracting", progress: "Reading your files…" });
    const { text, stats } = await extractAll(files, pastedText, {
      warn: (message) => warnings.push(message),
      progress: (message) => updateBrief(id, { progress: message }),
      ocrBudget: { remaining: config.limits.maxOcrImages, used: 0 },
    });
    updateBrief(id, { extractedText: text, stats, warnings });

    if (stats.words < MIN_WORDS) {
      updateBrief(id, {
        status: "failed",
        progress: "",
        error:
          stats.words === 0
            ? "We couldn't find any readable text in what you uploaded."
            : `We only found ${stats.words} words, which isn't enough for a brief. Try adding speaker notes or a transcript.`,
      });
      return;
    }

    await generate(id);
  } catch (err) {
    console.error(`[brief ${id}] processing failed`, err);
    updateBrief(id, { status: "failed", progress: "", error: errorMessage(err), warnings });
  }
}

/** Re-run only the writing step, from the text already extracted. */
export async function regenerateBrief(id: string, engine: Engine, options?: Partial<BriefOptions>): Promise<void> {
  const brief = getBrief(id);
  if (!brief) return;
  updateBrief(id, { options: { ...brief.options, ...options, engine }, error: null });
  try {
    await generate(id);
  } catch (err) {
    console.error(`[brief ${id}] regeneration failed`, err);
    updateBrief(id, { status: "failed", progress: "", error: errorMessage(err) });
  }
}

async function generate(id: string): Promise<void> {
  const brief = getBrief(id)!;
  const { options, extractedText, meta } = brief;
  const notices: string[] = [];
  const outline = detectOutline(extractedText);
  updateBrief(id, { status: "generating", progress: "Writing your brief…", notices });

  let content: BriefContent | null = null;
  let credits: number | null = null;
  let engineUsed: Engine = "local";

  if (options.engine === "tavily") {
    if (!tavilyConfigured()) {
      notices.push("Tavily isn't connected, so the free local engine was used instead.");
    } else {
      try {
        const result = await generateWithTavily(extractedText, options, meta, outline, (progress) =>
          updateBrief(id, { progress }),
        );
        content = result.content;
        credits = result.credits;
        engineUsed = "tavily";
        notices.push(...result.warnings);
      } catch (err) {
        console.error(`[brief ${id}] Tavily failed, falling back to local`, err);
        notices.push(`${errorMessage(err)} The free local engine was used instead.`);
      }
    }
  }

  if (!content) {
    updateBrief(id, { progress: "Building your brief with the local engine…" });
    const result = generateLocally(extractedText, options, meta);
    content = result.content;
    notices.push(...result.warnings);
  }

  // What the user typed always wins over what the engine detected.
  content = {
    ...content,
    title: meta.title || content.title.trim() || fallbackTitle(extractedText),
    speaker: meta.speaker || content.speaker,
    date: meta.sermonDate || content.date,
    series: meta.series || content.series,
  };

  // Keep the brief in the preacher's own words: the sermon's real outline, and
  // paraphrased lines pulled back to the sentences they came from.
  if (options.sections.outline && outline) content = { ...content, outline: applyOutline(content.outline, outline) };
  const conclusion = detectConclusion(extractedText);
  if (conclusion) content = { ...content, summary: conclusion };
  const mainText = firstScripture(extractedText);
  if (mainText) {
    const key = (ref: string) => ref.replace(/[\s–—-]+/g, "").toLowerCase();
    const rest = content.scriptures.filter((ref) => key(ref) !== key(mainText));
    content = { ...content, scriptures: [mainText, ...rest].slice(0, 5) };
  }
  const index = buildSourceIndex(extractedText);
  content = snapToSource(content, index);
  const grounding = measure(content, options, index);

  updateBrief(id, {
    status: "ready",
    progress: "",
    error: null,
    content,
    engineUsed,
    // Credits accumulate across regenerations so the dashboard total stays honest.
    credits: credits === null ? brief.credits : (brief.credits ?? 0) + credits,
    notices,
    grounding,
    title: content.title,
    speaker: content.speaker,
    sermonDate: content.date,
    series: content.series,
  });
}

/** First short line of the material (usually the title slide or page heading), else the file name. */
function fallbackTitle(sourceText: string): string {
  const lines = sourceText.split("\n").map((l) => l.trim());
  const first = lines.find((l) => l && !l.startsWith("#") && !l.startsWith("[") && l.split(/\s+/).length <= 14);
  const fileName = lines.find((l) => l.startsWith("# Source: "))?.replace(/^# Source: (.+?)(\.[a-z0-9]+)? \(\w+\)$/i, "$1");
  return first || fileName || "Untitled sermon";
}
