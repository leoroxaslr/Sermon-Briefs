import "server-only";
import { connection } from "next/server";
import { getTavilyUsage, type TavilyUsage } from "./ai/tavily";
import { tavilyConfigured } from "./settings";
import { getBrief, getTotals, listBriefs } from "./db";

/**
 * Request-time data access for Server Components. node:sqlite is synchronous, so
 * each loader calls connection() first to keep the query out of prerendering.
 */

export async function loadBriefs() {
  await connection();
  return listBriefs();
}

export async function loadTotals() {
  await connection();
  return getTotals();
}

export async function loadBrief(id: string) {
  await connection();
  const brief = getBrief(id);
  if (!brief) return null;
  // The extracted text can be large; the page fetches it on demand.
  const { extractedText, ...rest } = brief;
  return { ...rest, hasSourceText: extractedText.length > 0 };
}

export type ClientBrief = NonNullable<Awaited<ReturnType<typeof loadBrief>>>;

export async function loadTavilyStatus(): Promise<
  { connected: false } | { connected: true; usage: TavilyUsage | null; error?: string }
> {
  await connection();
  if (!tavilyConfigured()) return { connected: false };
  try {
    return { connected: true, usage: await getTavilyUsage() };
  } catch (err) {
    return { connected: true, usage: null, error: err instanceof Error ? err.message : "Couldn't load usage." };
  }
}

export async function isTavilyConfigured() {
  await connection();
  return tavilyConfigured();
}
