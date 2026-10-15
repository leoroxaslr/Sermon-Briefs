"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Library, Search } from "lucide-react";
import { formatSermonDate, timeAgo } from "@/lib/format";
import { NEW_WORDING_TARGET } from "@/lib/grounding";
import type { BriefSummary } from "@/lib/types";
import { EngineBadge, SourceIcon, StatusBadge } from "./badges";

export function BriefList({ briefs }: { briefs: BriefSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return briefs;
    return briefs.filter((b) =>
      [b.title, b.speaker, b.series, b.bigIdea, b.sermonDate, ...b.sources.map((s) => s.name)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [briefs, query]);

  if (briefs.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
        <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
          <Library className="size-5" aria-hidden />
        </span>
        <p className="font-medium">No briefs yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Upload this week&apos;s slides or transcript above. Every brief you create is saved here so you can reprint or
          edit it later.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, speaker, series or file name"
          aria-label="Search briefs"
          className="w-full rounded-lg border border-border-strong bg-surface py-2 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted">
          No briefs match “{query}”.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {filtered.map((brief) => (
            <li key={brief.id}>
              <Link
                href={`/briefs/${brief.id}`}
                className="group flex flex-col gap-1.5 px-4 py-3 transition hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium group-hover:text-accent">{brief.title || "Untitled sermon"}</p>
                    <StatusBadge status={brief.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {[brief.speaker, formatSermonDate(brief.sermonDate), brief.series].filter(Boolean).join(" · ") ||
                      brief.bigIdea ||
                      brief.sources.map((s) => s.name).join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1" title={brief.sources.map((s) => s.name).join("\n")}>
                    {[...new Set(brief.sources.map((s) => s.kind))].map((kind) => (
                      <SourceIcon key={kind} kind={kind} className="size-3.5" />
                    ))}
                  </span>
                  {brief.newWording !== null && (
                    <span
                      className={brief.newWording <= NEW_WORDING_TARGET ? "text-success" : "text-warning"}
                      title="Share of new wording (not from the sermon)"
                    >
                      {Math.round(brief.newWording * 100)}% new
                    </span>
                  )}
                  <EngineBadge engine={brief.engineUsed} />
                  <time dateTime={brief.createdAt} className="w-20 text-right tabular-nums" suppressHydrationWarning>
                    {timeAgo(brief.createdAt)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
