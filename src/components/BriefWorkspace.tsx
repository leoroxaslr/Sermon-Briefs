"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  Highlighter,
  Info,
  LoaderCircle,
  Pencil,
  Printer,
  RefreshCw,
  ScrollText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ClientBrief } from "@/lib/data";
import { formatBytes, pluralize } from "@/lib/format";
import { buildSourceIndex, NEW_WORDING_TARGET, SECTION_ORDER, segment, type Grounding } from "@/lib/grounding";
import { SECTION_LABELS, type BriefContent } from "@/lib/types";
import { EngineBadge, isProcessing, SourceIcon, StatusBadge } from "./badges";
import { BriefEditor } from "./BriefEditor";
import { BriefPaper } from "./BriefPaper";
import { briefAsText } from "./brief-text";
import { RegenerateDialog } from "./RegenerateDialog";

const POLL_MS = 1500;

export function BriefWorkspace({ initial, tavilyReady }: { initial: ClientBrief; tavilyReady: boolean }) {
  const router = useRouter();
  const [brief, setBrief] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourceFailed, setSourceFailed] = useState(false);
  const processing = isProcessing(brief.status);

  // The extracted text is fetched once, on demand, for the source panel and the highlighter.
  const loadSource = useCallback(() => {
    if (sourceText !== null) return;
    fetch(`/api/briefs/${brief.id}/source`, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setSourceText)
      .catch(() => setSourceFailed(true));
  }, [brief.id, sourceText]);

  const index = useMemo(() => (sourceText ? buildSourceIndex(sourceText) : null), [sourceText]);
  const mark = useMemo(() => {
    if (!highlight || !index) return undefined;
    return (text: string) =>
      segment(text, index).map((s, i) => (s.isNew ? <mark key={i}>{s.text}</mark> : s.text));
  }, [highlight, index]);

  // Poll while the server is working on this brief.
  useEffect(() => {
    if (!processing) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/briefs/${brief.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as ClientBrief;
        if (!cancelled) setBrief(next);
      } catch {
        // transient network error; try again next tick
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [brief.id, processing]);

  // Name the browser tab (and the "Save as PDF" file) after the sermon.
  useEffect(() => {
    if (brief.content?.title) document.title = `${brief.content.title} · Sermon Brief`;
  }, [brief.content?.title]);

  async function save(content: BriefContent) {
    const res = await fetch(`/api/briefs/${brief.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Couldn't save your changes.");
    const fresh = await fetch(`/api/briefs/${brief.id}`, { cache: "no-store" });
    if (fresh.ok) setBrief((await fresh.json()) as ClientBrief);
    else setBrief((b) => ({ ...b, content, title: content.title }));
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${brief.title || "this brief"}"? This can't be undone.`)) return;
    const res = await fetch(`/api/briefs/${brief.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      setActionError("Couldn't delete this brief. Please try again.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function copyText() {
    if (!brief.content) return;
    try {
      await navigator.clipboard.writeText(briefAsText(brief.content, brief.options));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Your browser blocked copying. Try selecting the text on the page instead.");
    }
  }

  function onRegenerated() {
    setRegenOpen(false);
    setEditing(false);
    setBrief((b) => ({ ...b, status: "generating", progress: "Starting…", error: null }));
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 print:max-w-none print:p-0">
      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Link href="/" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ArrowLeft className="size-4" aria-hidden /> All briefs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{brief.title || "New brief"}</h1>
            <StatusBadge status={brief.status} />
            <EngineBadge engine={brief.engineUsed} />
            {brief.status === "ready" && brief.grounding && <WordingChip grounding={brief.grounding} />}
            {brief.credits ? (
              <span className="text-xs text-muted">{pluralize(brief.credits, "credit")}</span>
            ) : null}
          </div>
        </div>

        {brief.status === "ready" && !editing && (
          <div className="flex flex-wrap gap-2">
            <ToolbarButton onClick={() => window.print()} primary icon={<Printer className="size-4" aria-hidden />}>
              Print / Save PDF
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                loadSource();
                setHighlight((v) => !v);
              }}
              pressed={highlight}
              icon={<Highlighter className="size-4" aria-hidden />}
            >
              Highlight new wording
            </ToolbarButton>
            <ToolbarButton onClick={() => setEditing(true)} icon={<Pencil className="size-4" aria-hidden />}>
              Edit
            </ToolbarButton>
            <ToolbarButton
              onClick={copyText}
              icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            >
              {copied ? "Copied" : "Copy text"}
            </ToolbarButton>
            <ToolbarButton onClick={() => setRegenOpen(true)} icon={<RefreshCw className="size-4" aria-hidden />}>
              Regenerate
            </ToolbarButton>
            <ToolbarButton onClick={remove} danger icon={<Trash2 className="size-4" aria-hidden />} label="Delete brief" />
          </div>
        )}
        {brief.status === "failed" && (
          <div className="flex flex-wrap gap-2">
            {brief.hasSourceText && (
              <ToolbarButton onClick={() => setRegenOpen(true)} primary icon={<RefreshCw className="size-4" aria-hidden />}>
                Try again
              </ToolbarButton>
            )}
            <ToolbarButton onClick={remove} danger icon={<Trash2 className="size-4" aria-hidden />}>
              Delete
            </ToolbarButton>
          </div>
        )}
      </div>

      {actionError && (
        <Notice tone="danger" onDismiss={() => setActionError(null)}>
          {actionError}
        </Notice>
      )}

      {processing && <Progress brief={brief} />}

      {brief.status === "failed" && (
        <Notice tone="danger">
          <p className="font-medium">This brief couldn&apos;t be created</p>
          <p>{brief.error}</p>
        </Notice>
      )}

      {!processing && (brief.warnings.length > 0 || brief.notices.length > 0) && !editing && (
        <div className="mb-4 space-y-2 print:hidden">
          {brief.warnings.map((w, i) => (
            <Notice key={`w${i}`} tone="warning">
              {w}
            </Notice>
          ))}
          {brief.notices.map((n, i) => (
            <Notice key={`n${i}`} tone="info">
              {n}
            </Notice>
          ))}
        </div>
      )}

      {brief.status === "ready" && brief.content && (
        <>
          {editing ? (
            <BriefEditor initial={brief.content} options={brief.options} onSave={save} onCancel={() => setEditing(false)} />
          ) : (
            // The page is a fixed 8.5in wide; let it scroll sideways on small screens.
            <>
              {highlight && (
                <HighlightLegend grounding={brief.grounding} loading={!index && !sourceFailed} failed={sourceFailed} />
              )}
              <div className="-mx-4 overflow-x-auto px-4 pb-6 print:m-0 print:overflow-visible print:p-0">
                <BriefPaper content={brief.content} options={brief.options} mark={mark} />
              </div>
            </>
          )}
        </>
      )}

      {!processing && (
        <SourcePanel
          brief={brief}
          open={showSource}
          text={sourceText}
          failed={sourceFailed}
          onToggle={() => {
            loadSource();
            setShowSource((v) => !v);
          }}
        />
      )}

      {regenOpen && (
        <RegenerateDialog
          briefId={brief.id}
          options={brief.options}
          tavilyReady={tavilyReady}
          onClose={() => setRegenOpen(false)}
          onStarted={onRegenerated}
        />
      )}
    </main>
  );
}

function Progress({ brief }: { brief: ClientBrief }) {
  const steps = [
    { key: "extracting", label: "Reading files", detail: "Text, speaker notes and words inside images" },
    {
      key: "generating",
      label: "Writing the brief",
      detail: brief.options.engine === "tavily" ? "Tavily usually takes 30–90 seconds" : "Usually a few seconds",
    },
    { key: "ready", label: "Ready to print", detail: "" },
  ];
  const current = brief.status === "queued" ? -1 : steps.findIndex((s) => s.key === brief.status);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6" aria-live="polite">
      <ol className="space-y-4">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.key} className="flex gap-3">
              <span
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  done ? "bg-success text-white" : active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"
                }`}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : active ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : i + 1}
              </span>
              <div>
                <p className={active ? "font-medium" : done ? "" : "text-muted"}>{step.label}</p>
                {active && <p className="text-sm text-muted">{brief.progress || step.detail}</p>}
                {active && brief.progress && step.detail && <p className="text-xs text-muted">{step.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 border-t border-border pt-3 text-xs text-muted tabular-nums">
        {elapsed}s elapsed · You can leave this page; the brief will be waiting on your dashboard.
      </p>
    </section>
  );
}

function SourcePanel({
  brief,
  open,
  text,
  failed,
  onToggle,
}: {
  brief: ClientBrief;
  open: boolean;
  text: string | null;
  failed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="mx-auto mt-6 max-w-[8.5in] rounded-xl border border-border bg-surface print:hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
      >
        <span className="flex items-center gap-2 font-medium">
          <ScrollText className="size-4 text-muted" aria-hidden /> Source material
        </span>
        <span className="text-muted">
          {[
            brief.stats?.slides ? pluralize(brief.stats.slides, "slide") : null,
            brief.stats?.pages ? pluralize(brief.stats.pages, "page") : null,
            brief.stats?.imagesScanned ? `${pluralize(brief.stats.imagesScanned, "image")} scanned` : null,
            brief.stats ? pluralize(brief.stats.words, "word") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <ul className="mb-3 flex flex-wrap gap-2">
            {brief.sources.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs">
                <SourceIcon kind={s.kind} className="size-3.5 text-muted" />
                {s.name}
                {s.kind !== "pasted" && <span className="text-muted">{formatBytes(s.size)}</span>}
              </li>
            ))}
          </ul>
          {failed ? (
            <p className="text-sm text-danger">Couldn&apos;t load the source text.</p>
          ) : text === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : text ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {text}
            </pre>
          ) : (
            <p className="text-sm text-muted">No text was extracted.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ToolbarButton(props: {
  onClick: () => void;
  icon: React.ReactNode;
  children?: React.ReactNode;
  label?: string;
  primary?: boolean;
  danger?: boolean;
  pressed?: boolean;
}) {
  const style = props.primary
    ? "bg-accent text-accent-fg hover:bg-accent-hover border-transparent"
    : props.danger
      ? "border-border-strong text-danger hover:bg-danger-soft"
      : props.pressed
        ? "border-accent bg-accent-soft text-accent"
        : "border-border-strong hover:bg-surface-2";
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={props.label}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${style}`}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: "info" | "warning" | "danger";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles = {
    info: ["bg-accent-soft text-text", Info, "text-accent"],
    warning: ["bg-warning-soft text-text", TriangleAlert, "text-warning"],
    danger: ["bg-danger-soft text-text", CircleAlert, "text-danger"],
  } as const;
  const [className, Icon, iconClass] = styles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`mx-auto mb-4 flex max-w-[8.5in] gap-2.5 rounded-lg px-3 py-2.5 text-sm print:hidden ${className}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconClass}`} aria-hidden />
      <div className="flex-1 space-y-0.5">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-muted hover:text-text" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const SECTION_NAMES: Record<(typeof SECTION_ORDER)[number], string> = { core: "Big idea & summary", ...SECTION_LABELS };

function WordingChip({ grounding }: { grounding: Grounding }) {
  const ok = grounding.newWording <= NEW_WORDING_TARGET;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
      title="Share of the brief's words that don't appear in the sermon material. Target: under 10%."
    >
      {pct(grounding.newWording)} new wording
    </span>
  );
}

function HighlightLegend({
  grounding,
  loading,
  failed,
}: {
  grounding: Grounding | null;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <div className="mx-auto mb-4 max-w-[8.5in] rounded-lg border border-border bg-surface px-3 py-2.5 text-sm print:hidden">
      <p>
        <mark className="rounded-sm bg-[#fff1a8] px-1 text-[#1b1a17] underline decoration-[#d4a300]">Highlighted</mark>{" "}
        words don&apos;t appear in the sermon material. Everything else is the preacher&apos;s own wording.
        {loading && <span className="text-muted"> Loading…</span>}
        {failed && <span className="text-danger"> Couldn&apos;t load the source text.</span>}
      </p>
      {grounding && (
        <p className="mt-1 text-xs text-muted">
          {SECTION_ORDER.filter((k) => grounding.bySection[k] !== undefined)
            .map((k) => `${SECTION_NAMES[k]} ${pct(grounding.bySection[k]!)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
