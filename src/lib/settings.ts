import "server-only";
import fs from "node:fs";
import { z } from "zod";
import { config } from "./config";

/**
 * User settings saved from the Settings page (data/settings.json). Environment
 * variables, e.g. from .env.local, take precedence so server deployments can
 * keep using them.
 */

const SettingsSchema = z.object({
  tavilyApiKey: z.string().default(""),
  tavilyModel: z.enum(["mini", "pro"]).default("mini"),
});
export type Settings = z.infer<typeof SettingsSchema>;

function readFile(): Settings {
  try {
    return SettingsSchema.parse(JSON.parse(fs.readFileSync(config.settingsPath, "utf8")));
  } catch {
    return SettingsSchema.parse({});
  }
}

export function saveSettings(update: Partial<Settings>): void {
  const next = SettingsSchema.parse({ ...readFile(), ...update });
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${config.settingsPath}.tmp`;
  // Owner-only permissions on macOS/Linux; on Windows the file sits in the user's own AppData.
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, config.settingsPath);
}

const envKey = () => process.env.TAVILY_API_KEY?.trim() || "";
const envModel = () => process.env.TAVILY_RESEARCH_MODEL?.trim();

/** Read at call time so a key saved in Settings applies without a restart. */
export function tavilySettings(): { apiKey: string; model: "mini" | "pro"; source: "env" | "settings" | "none" } {
  const file = readFile();
  const apiKey = envKey() || file.tavilyApiKey.trim();
  const model = envModel() === "pro" || envModel() === "mini" ? (envModel() as "mini" | "pro") : file.tavilyModel;
  return { apiKey, model, source: envKey() ? "env" : apiKey ? "settings" : "none" };
}

export const tavilyConfigured = () => tavilySettings().apiKey.length > 0;

/** Shown in the UI instead of the key itself. */
export function maskKey(key: string): string {
  return key ? `${key.slice(0, 5)}…${key.slice(-4)}` : "";
}
