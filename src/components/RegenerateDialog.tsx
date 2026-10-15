"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, LoaderCircle, Sparkles } from "lucide-react";
import {
  AUDIENCE_LABELS,
  AUDIENCES,
  SECTION_KEYS,
  SECTION_LABELS,
  type Audience,
  type BriefOptions,
  type Engine,
} from "@/lib/types";

export function RegenerateDialog({
  briefId,
  options,
  tavilyReady,
  onClose,
  onStarted,
}: {
  briefId: string;
  options: BriefOptions;
  tavilyReady: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [engine, setEngine] = useState<Engine>(tavilyReady ? options.engine : "local");
  const [audience, setAudience] = useState<Audience>(options.audience);
  const [sections, setSections] = useState(options.sections);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefs/${briefId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine, audience, sections }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't start regenerating.");
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start regenerating.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <h2 className="text-lg font-semibold">Regenerate brief</h2>
        <p className="mt-1 text-sm text-muted">
          Rewrites the brief from the text already pulled from your files. Edits you saved to the title, speaker, date
          and series are kept.
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Engine</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["tavily", "Tavily AI", tavilyReady ? "Uses Tavily credits" : "Not connected", Sparkles, !tavilyReady],
                ["local", "Local", "Free and instant", Cpu, false],
              ] as const
            ).map(([value, title, desc, Icon, disabled]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  engine === value ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2"
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="regen-engine"
                  className="sr-only"
                  checked={engine === value}
                  disabled={disabled}
                  onChange={() => setEngine(value)}
                />
                <Icon className={`mt-0.5 size-4 ${engine === value ? "text-accent" : "text-muted"}`} aria-hidden />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-xs text-muted">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-sm">
          <span className="mb-2 block font-medium">Written for</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 focus:border-accent focus:outline-none"
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Sections</legend>
          <div className="flex flex-wrap gap-2">
            {SECTION_KEYS.map((key) => (
              <label
                key={key}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  sections[key] ? "border-accent bg-accent-soft text-accent" : "border-border-strong text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={sections[key]}
                  onChange={(e) => setSections((s) => ({ ...s, [key]: e.target.checked }))}
                />
                {SECTION_LABELS[key]}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Regenerate
        </button>
      </div>
    </dialog>
  );
}
