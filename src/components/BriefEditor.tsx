"use client";

import { useState } from "react";
import { LoaderCircle, Plus, Save, X } from "lucide-react";
import { SECTION_LABELS, type BriefContent, type BriefOptions } from "@/lib/types";

const toLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Form editor for a brief. Lists are edited one item per line. */
export function BriefEditor({
  initial,
  options,
  onSave,
  onCancel,
}: {
  initial: BriefContent;
  options: BriefOptions;
  onSave: (content: BriefContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    ...initial,
    scripturesText: initial.scriptures.join("\n"),
    quotesText: initial.keyQuotes.join("\n"),
    takeawaysText: initial.takeaways.join("\n"),
    questionsText: initial.reflectionQuestions.join("\n"),
    outlineDraft: initial.outline.map((o) => ({ heading: o.heading, pointsText: o.points.join("\n") })),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = options.sections;

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: draft.title.trim() || "Untitled sermon",
        speaker: draft.speaker.trim(),
        date: draft.date.trim(),
        series: draft.series.trim(),
        scriptures: toLines(draft.scripturesText),
        bigIdea: draft.bigIdea.trim(),
        summary: draft.summary.trim(),
        outline: draft.outlineDraft
          .map((o) => ({ heading: o.heading.trim(), points: toLines(o.pointsText) }))
          .filter((o) => o.heading || o.points.length),
        keyQuotes: toLines(draft.quotesText),
        takeaways: toLines(draft.takeawaysText),
        reflectionQuestions: toLines(draft.questionsText),
        application: draft.application.trim(),
        prayer: draft.prayer.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <input className={inputClass} value={draft.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Speaker">
          <input className={inputClass} value={draft.speaker} onChange={(e) => set("speaker", e.target.value)} />
        </Field>
        <Field label="Date preached">
          <input className={inputClass} value={draft.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Series">
          <input className={inputClass} value={draft.series} onChange={(e) => set("series", e.target.value)} />
        </Field>
        <Field label="Scriptures" hint="One per line">
          <textarea
            className={inputClass}
            rows={2}
            value={draft.scripturesText}
            onChange={(e) => set("scripturesText", e.target.value)}
          />
        </Field>
        <Field label="The big idea" className="sm:col-span-2">
          <textarea className={inputClass} rows={2} value={draft.bigIdea} onChange={(e) => set("bigIdea", e.target.value)} />
        </Field>
        <Field label="Summary" className="sm:col-span-2">
          <textarea className={inputClass} rows={3} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
        </Field>

        {s.outline && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">{SECTION_LABELS.outline}</legend>
            <div className="space-y-3">
              {draft.outlineDraft.map((part, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex gap-2">
                    <input
                      className={`${inputClass} font-medium`}
                      value={part.heading}
                      placeholder={`Point ${i + 1} heading`}
                      aria-label={`Outline point ${i + 1} heading`}
                      onChange={(e) =>
                        set(
                          "outlineDraft",
                          draft.outlineDraft.map((o, j) => (j === i ? { ...o, heading: e.target.value } : o)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => set("outlineDraft", draft.outlineDraft.filter((_, j) => j !== i))}
                      className="rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={`Remove outline point ${i + 1}`}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <textarea
                    className={`${inputClass} mt-2`}
                    rows={2}
                    value={part.pointsText}
                    placeholder="Supporting points, one per line"
                    aria-label={`Outline point ${i + 1} supporting points`}
                    onChange={(e) =>
                      set(
                        "outlineDraft",
                        draft.outlineDraft.map((o, j) => (j === i ? { ...o, pointsText: e.target.value } : o)),
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("outlineDraft", [...draft.outlineDraft, { heading: "", pointsText: "" }])}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                <Plus className="size-4" aria-hidden /> Add a point
              </button>
            </div>
          </fieldset>
        )}

        {s.quotes && (
          <Field label={SECTION_LABELS.quotes} hint="One per line" className="sm:col-span-2">
            <textarea className={inputClass} rows={3} value={draft.quotesText} onChange={(e) => set("quotesText", e.target.value)} />
          </Field>
        )}
        {s.takeaways && (
          <Field label={SECTION_LABELS.takeaways} hint="One per line" className="sm:col-span-2">
            <textarea
              className={inputClass}
              rows={4}
              value={draft.takeawaysText}
              onChange={(e) => set("takeawaysText", e.target.value)}
            />
          </Field>
        )}
        {s.reflection && (
          <Field label={SECTION_LABELS.reflection} hint="One per line" className="sm:col-span-2">
            <textarea
              className={inputClass}
              rows={4}
              value={draft.questionsText}
              onChange={(e) => set("questionsText", e.target.value)}
            />
          </Field>
        )}
        {s.application && (
          <Field label={SECTION_LABELS.application} className="sm:col-span-2">
            <textarea
              className={inputClass}
              rows={2}
              value={draft.application}
              onChange={(e) => set("application", e.target.value)}
            />
          </Field>
        )}
        {s.prayer && (
          <Field label={SECTION_LABELS.prayer} className="sm:col-span-2">
            <textarea className={inputClass} rows={3} value={draft.prayer} onChange={(e) => set("prayer", e.target.value)} />
          </Field>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          Save changes
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none";

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 flex items-baseline justify-between">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
