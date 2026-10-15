/** Display helpers shared by server and client components. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Format a sermon date. Accepts ISO dates from the date picker or free text from AI output. */
export function formatSermonDate(value: string): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return value;
  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function timeAgo(isoTimestamp: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(isoTimestamp).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(isoTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function pluralize(count: number, word: string, plural = `${word}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? word : plural}`;
}
