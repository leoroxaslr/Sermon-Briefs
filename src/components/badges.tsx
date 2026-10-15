import { CircleCheck, CircleX, ClipboardPaste, Captions, FileImage, FileText, LoaderCircle, Presentation } from "lucide-react";
import type { BriefStatus, Engine, SourceKind } from "@/lib/types";

const STATUS: Record<BriefStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-surface-2 text-muted" },
  extracting: { label: "Reading files", className: "bg-accent-soft text-accent" },
  generating: { label: "Writing", className: "bg-accent-soft text-accent" },
  ready: { label: "Ready", className: "bg-success-soft text-success" },
  failed: { label: "Failed", className: "bg-danger-soft text-danger" },
};

export const isProcessing = (status: BriefStatus) =>
  status === "queued" || status === "extracting" || status === "generating";

export function StatusBadge({ status }: { status: BriefStatus }) {
  const { label, className } = STATUS[status];
  const Icon = status === "ready" ? CircleCheck : status === "failed" ? CircleX : LoaderCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      <Icon className={`size-3 ${isProcessing(status) ? "animate-spin" : ""}`} aria-hidden />
      {label}
    </span>
  );
}

export function EngineBadge({ engine }: { engine: Engine | null }) {
  if (!engine) return null;
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      {engine === "tavily" ? "Tavily AI" : "Local"}
    </span>
  );
}

const SOURCE_ICONS: Record<SourceKind, typeof FileText> = {
  pptx: Presentation,
  pdf: FileText,
  docx: FileText,
  image: FileImage,
  transcript: Captions,
  text: FileText,
  pasted: ClipboardPaste,
};

export function SourceIcon({ kind, className = "size-4" }: { kind: SourceKind; className?: string }) {
  const Icon = SOURCE_ICONS[kind];
  return <Icon className={className} aria-hidden />;
}
