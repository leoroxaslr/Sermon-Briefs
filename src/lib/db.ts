import "server-only";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import type { Grounding } from "./grounding";
import {
  BriefContentSchema,
  BriefOptionsSchema,
  type BriefContent,
  type BriefMeta,
  type BriefOptions,
  type BriefRecord,
  type BriefStatus,
  type BriefSummary,
  type Engine,
  type ExtractionStats,
  type SourceFileInfo,
} from "./types";

type Row = Record<string, string | number | null>;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS briefs (
     id            TEXT PRIMARY KEY,
     title         TEXT NOT NULL DEFAULT '',
     speaker       TEXT NOT NULL DEFAULT '',
     sermon_date   TEXT NOT NULL DEFAULT '',
     series        TEXT NOT NULL DEFAULT '',
     status        TEXT NOT NULL,
     progress      TEXT NOT NULL DEFAULT '',
     error         TEXT,
     engine        TEXT NOT NULL,
     engine_used   TEXT,
     options       TEXT NOT NULL,
     meta          TEXT NOT NULL DEFAULT '{}',
     sources       TEXT NOT NULL DEFAULT '[]',
     stats         TEXT,
     extracted_text TEXT NOT NULL DEFAULT '',
     content       TEXT,
     warnings      TEXT NOT NULL DEFAULT '[]',
     notices       TEXT NOT NULL DEFAULT '[]',
     credits       INTEGER,
     created_at    TEXT NOT NULL,
     updated_at    TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS briefs_created_at ON briefs(created_at DESC);`,
  `ALTER TABLE briefs ADD COLUMN grounding TEXT;`,
];

function open(): DatabaseSync {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    db.exec(MIGRATIONS[i]);
    db.exec(`PRAGMA user_version = ${i + 1}`);
    db.exec("COMMIT");
  }

  // Jobs run in-process, so anything mid-flight when the server stopped is orphaned.
  db.prepare(
    `UPDATE briefs SET status = 'failed', progress = '',
       error = 'Processing was interrupted because the server restarted. Use "Regenerate" or upload again.'
     WHERE status IN ('queued', 'extracting', 'generating')`,
  ).run();

  return db;
}

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { __sermonDb?: DatabaseSync };
function db(): DatabaseSync {
  globalForDb.__sermonDb ??= open();
  return globalForDb.__sermonDb;
}

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

function toRecord(row: Row): BriefRecord {
  const content = parseJson<unknown>(row.content, null);
  return {
    id: String(row.id),
    title: String(row.title),
    speaker: String(row.speaker),
    sermonDate: String(row.sermon_date),
    series: String(row.series),
    status: row.status as BriefStatus,
    progress: String(row.progress ?? ""),
    error: (row.error as string | null) ?? null,
    engine: row.engine as Engine,
    engineUsed: (row.engine_used as Engine | null) ?? null,
    options: BriefOptionsSchema.parse(parseJson(row.options, {})),
    meta: { title: "", speaker: "", sermonDate: "", series: "", ...parseJson<Partial<BriefMeta>>(row.meta, {}) },
    sources: parseJson<SourceFileInfo[]>(row.sources, []),
    stats: parseJson<ExtractionStats | null>(row.stats, null),
    extractedText: String(row.extracted_text ?? ""),
    content: content ? BriefContentSchema.parse(content) : null,
    warnings: parseJson<string[]>(row.warnings, []),
    notices: parseJson<string[]>(row.notices, []),
    grounding: parseJson<Grounding | null>(row.grounding, null),
    credits: (row.credits as number | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type NewBrief = {
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  options: BriefOptions;
  sources: SourceFileInfo[];
};

export function createBrief(input: NewBrief): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO briefs (id, title, speaker, sermon_date, series, status, progress, engine,
         options, meta, sources, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 'Waiting to start…', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.speaker,
      input.sermonDate,
      input.series,
      input.options.engine,
      JSON.stringify(input.options),
      JSON.stringify({ title: input.title, speaker: input.speaker, sermonDate: input.sermonDate, series: input.series }),
      JSON.stringify(input.sources),
      now,
      now,
    );
  return id;
}

export function getBrief(id: string): BriefRecord | null {
  const row = db().prepare("SELECT * FROM briefs WHERE id = ?").get(id) as Row | undefined;
  return row ? toRecord(row) : null;
}

export function listBriefs(): BriefSummary[] {
  const rows = db()
    .prepare(
      `SELECT id, title, speaker, sermon_date, series, status, engine_used, sources, credits,
              created_at, json_extract(content, '$.bigIdea') AS big_idea,
              json_extract(grounding, '$.newWording') AS new_wording
       FROM briefs ORDER BY created_at DESC`,
    )
    .all() as Row[];
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    speaker: String(row.speaker),
    sermonDate: String(row.sermon_date),
    series: String(row.series),
    status: row.status as BriefStatus,
    engineUsed: (row.engine_used as Engine | null) ?? null,
    sources: parseJson<SourceFileInfo[]>(row.sources, []),
    credits: (row.credits as number | null) ?? null,
    createdAt: String(row.created_at),
    bigIdea: String(row.big_idea ?? ""),
    newWording: (row.new_wording as number | null) ?? null,
  }));
}

export type BriefUpdate = Partial<{
  status: BriefStatus;
  progress: string;
  error: string | null;
  engineUsed: Engine;
  options: BriefOptions;
  meta: BriefMeta;
  stats: ExtractionStats;
  extractedText: string;
  content: BriefContent;
  warnings: string[];
  notices: string[];
  grounding: Grounding | null;
  credits: number | null;
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
}>;

const COLUMN: Record<keyof BriefUpdate, string> = {
  status: "status",
  progress: "progress",
  error: "error",
  engineUsed: "engine_used",
  options: "options",
  meta: "meta",
  stats: "stats",
  extractedText: "extracted_text",
  content: "content",
  warnings: "warnings",
  notices: "notices",
  grounding: "grounding",
  credits: "credits",
  title: "title",
  speaker: "speaker",
  sermonDate: "sermon_date",
  series: "series",
};

const JSON_FIELDS = new Set<keyof BriefUpdate>(["options", "meta", "stats", "content", "warnings", "notices", "grounding"]);

export function updateBrief(id: string, update: BriefUpdate): void {
  const keys = Object.keys(update) as (keyof BriefUpdate)[];
  if (keys.length === 0) return;
  // Column names come from the fixed COLUMN map, never from user input.
  const sets = keys.map((k) => `${COLUMN[k]} = ?`);
  const values = keys.map((k) => {
    const v = update[k];
    if (v === undefined || v === null) return null;
    return JSON_FIELDS.has(k) ? JSON.stringify(v) : (v as string | number);
  });
  db()
    .prepare(`UPDATE briefs SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...values, new Date().toISOString(), id);
}

export function deleteBrief(id: string): boolean {
  return db().prepare("DELETE FROM briefs WHERE id = ?").run(id).changes > 0;
}

export function getTotals(): { total: number; ready: number; thisMonth: number; credits: number } {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return db()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'ready'), 0) AS ready,
              COALESCE(SUM(created_at >= ?), 0) AS thisMonth,
              COALESCE(SUM(credits), 0) AS credits
       FROM briefs`,
    )
    .get(monthStart.toISOString()) as { total: number; ready: number; thisMonth: number; credits: number };
}
