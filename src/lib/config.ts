import "server-only";
import path from "node:path";

/**
 * Where briefs, settings and the OCR model live. The desktop app points this at the
 * user's AppData folder; otherwise it's ./data next to the project.
 */
const DATA_DIR = process.env.SERMON_BRIEF_DATA_DIR?.trim() || path.join(process.cwd(), "data");

export const config = {
  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, "sermon-brief.db"),
  settingsPath: path.join(DATA_DIR, "settings.json"),
  tessdataDir: path.join(DATA_DIR, "tessdata"),

  tavily: {
    baseUrl: "https://api.tavily.com",
    pollIntervalMs: 4_000,
    timeoutMs: 10 * 60_000,
    /** Tavily Research `files` limit is 80,000 words combined. */
    maxWords: 78_000,
  },

  limits: {
    maxFiles: 12,
    maxFileBytes: 60 * 1024 * 1024,
    maxTotalBytes: 150 * 1024 * 1024,
    maxPastedChars: 400_000,
    /** Guard against zip bombs inside .pptx/.docx files. */
    maxUncompressedBytes: 600 * 1024 * 1024,
    maxOcrImages: 80,
    /** Images smaller than this are almost always icons/logos. */
    minOcrImageBytes: 6 * 1024,
  },
} as const;
