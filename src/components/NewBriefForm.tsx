"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardPaste, Cpu, FileUp, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import { formatBytes } from "@/lib/format";
import {
  AUDIENCE_LABELS,
  AUDIENCES,
  SECTION_KEYS,
  SECTION_LABELS,
  type Audience,
  type BriefOptions,
  type Engine,
  type SectionKey,
} from "@/lib/types";

const ACCEPT = ".pptx,.pdf,.docx,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.srt,.vtt,.txt,.md";
const ACCEPTED = new Set(ACCEPT.split(",").map((e) => e.slice(1)));
const MAX_FILES = 12;
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const PREFS_KEY = "sermon-brief:prefs";

type Prefs = Pick<BriefOptions, "engine" | "audience" | "sections">;

const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  outline: true,
  quotes: true,
  takeaways: true,
  reflection: true,
  application: true,
  prayer: false,
};

// Last-used options live in this browser's storage. Storage can be unavailable; that's fine.
function readPrefs(): string | null {
  try {
    return localStorage.getItem(PREFS_KEY);
  } catch {
    return null;
  }
}
function subscribePrefs(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function parsePrefs(raw: string | null): Partial<Prefs> {
  try {
    return (JSON.parse(raw ?? "null") as Partial<Prefs> | null) ?? {};
  } catch {
    return {};
  }
}

export function NewBriefForm({ tavilyReady }: { tavilyReady: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState({ title: "", speaker: "", sermonDate: "", series: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Choices made on this page win; otherwise fall back to what was saved last time, then defaults.
  const savedRaw = useSyncExternalStore(subscribePrefs, readPrefs, () => null);
  const saved = useMemo(() => parsePrefs(savedRaw), [savedRaw]);
  const [engineChoice, setEngine] = useState<Engine | null>(null);
  const [audienceChoice, setAudience] = useState<Audience | null>(null);
  const [sectionsChoice, setSections] = useState<Record<SectionKey, boolean> | null>(null);

  const savedEngine = saved.engine === "local" || (saved.engine === "tavily" && tavilyReady) ? saved.engine : null;
  const engine: Engine = engineChoice ?? savedEngine ?? (tavilyReady ? "tavily" : "local");
  const audience: Audience =
    audienceChoice ?? (saved.audience && AUDIENCES.includes(saved.audience) ? saved.audience : "congregation");
  const sections = sectionsChoice ?? { ...DEFAULT_SECTIONS, ...saved.sections };

  function addFiles(list: FileList | File[]) {
    setError(null);
    const incoming = Array.from(list);
    const rejected = incoming.filter((f) => !ACCEPTED.has(f.name.split(".").pop()?.toLowerCase() ?? ""));
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = incoming.filter((f) => !rejected.includes(f) && !tooBig.includes(f));
    if (rejected.length) {
      setError(
        `${rejected.map((f) => f.name).join(", ")} ${rejected.length === 1 ? "isn't" : "aren't"} supported. Use PowerPoint (.pptx), PDF, Word (.docx), images, or transcripts (.txt, .srt, .vtt).`,
      );
    } else if (tooBig.length) {
      setError(`${tooBig[0].name} is larger than 60 MB.`);
    }
    setFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...ok.filter((f) => !names.has(`${f.name}:${f.size}`))].slice(0, MAX_FILES);
    });
  }

  const hasInput = mode === "upload" ? files.length > 0 : pasted.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput || submitting) return;
    setSubmitting(true);
    setError(null);

    const options: Prefs = { engine, audience, sections };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(options));
    } catch {
      // ignore
    }

    const body = new FormData();
    if (mode === "upload") files.forEach((f) => body.append("files", f));
    else body.append("pastedText", pasted);
    Object.entries(details).forEach(([k, v]) => body.append(k, v));
    body.append("options", JSON.stringify(options));

    try {
      const res = await fetch("/api/briefs", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Upload failed. Please try again.");
      router.push(`/briefs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setSubmitting(false);
    }
  }

  const totalSize = files.reduce((n, f) => n + f.size, 0);

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">New brief</h2>
        <div role="tablist" aria-label="Input type" className="flex rounded-lg bg-surface-2 p-0.5 text-sm">
          {(
            [
              ["upload", "Upload files", FileUp],
              ["paste", "Paste text", ClipboardPaste],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
                mode === value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "upload" ? (
        <div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
              dragging ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent hover:bg-surface-2"
            }`}
          >
            <span className="mb-2 grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
              <Upload className="size-5" aria-hidden />
            </span>
            <p className="font-medium">Drop sermon files here, or click to browse</p>
            <p className="mt-1 text-sm text-muted">
              PowerPoint, PDF, Word, slide images, or transcripts (.txt, .srt, .vtt). Text inside images is read too.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted tabular-nums">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
              <li className="px-3 py-1.5 text-xs text-muted">
                {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalSize)}
              </li>
            </ul>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor={`${ids}-paste`} className="sr-only">
            Sermon transcript or notes
          </label>
          <textarea
            id={`${ids}-paste`}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={9}
            placeholder="Paste a sermon transcript, manuscript, or notes. Timestamps from YouTube or caption files are cleaned up automatically."
            className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-muted tabular-nums">
            {pasted.trim() ? pasted.trim().split(/\s+/).length.toLocaleString() : 0} words
          </p>
        </div>
      )}

      {/* Details */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="flex items-center gap-1 text-sm font-medium text-muted hover:text-text"
        >
          <ChevronDown className={`size-4 transition ${showDetails ? "" : "-rotate-90"}`} aria-hidden />
          Sermon details <span className="font-normal">(optional, detected automatically)</span>
        </button>
        {showDetails && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["title", "Title", "text", "Faith Over Fear"],
                ["speaker", "Speaker", "text", "Pastor Dana Reyes"],
                ["sermonDate", "Date preached", "date", ""],
                ["series", "Series", "text", "Strong and Courageous"],
              ] as const
            ).map(([key, label, type, placeholder]) => (
              <label key={key} className="text-sm">
                <span className="mb-1 block text-muted">{label}</span>
                <input
                  type={type}
                  value={details[key]}
                  placeholder={placeholder}
                  maxLength={200}
                  onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 placeholder:text-muted/70 focus:border-accent focus:outline-none"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="mt-4 grid gap-4 border-t border-border pt-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Include sections</legend>
          <div className="flex flex-wrap gap-2">
            {SECTION_KEYS.map((key) => (
              <label
                key={key}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  sections[key]
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border-strong text-muted hover:text-text"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={sections[key]}
                  onChange={(e) => setSections({ ...sections, [key]: e.target.checked })}
                />
                {SECTION_LABELS[key]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <label className="text-sm">
            <span className="mb-2 block font-medium">Written for</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 focus:border-accent focus:outline-none sm:w-44"
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Writing engine</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <EngineOption
                checked={engine === "tavily"}
                disabled={!tavilyReady}
                onSelect={() => setEngine("tavily")}
                icon={<Sparkles className="size-4" aria-hidden />}
                title="Tavily AI"
                description={tavilyReady ? "Best results · uses Tavily credits" : "Add your Tavily key in Settings"}
              />
              <EngineOption
                checked={engine === "local"}
                onSelect={() => setEngine("local")}
                icon={<Cpu className="size-4" aria-hidden />}
                title="Local"
                description="Free and private · picks key lines"
              />
            </div>
          </fieldset>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!hasInput || submitting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Uploading…
          </>
        ) : (
          <>Create brief</>
        )}
      </button>
    </form>
  );
}

function EngineOption(props: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        props.checked ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2"
      } ${props.disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="engine"
        className="sr-only"
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onSelect}
      />
      <span className={`mt-0.5 ${props.checked ? "text-accent" : "text-muted"}`}>{props.icon}</span>
      <span>
        <span className="block font-medium">{props.title}</span>
        <span className="block text-xs text-muted">{props.description}</span>
      </span>
    </label>
  );
}
