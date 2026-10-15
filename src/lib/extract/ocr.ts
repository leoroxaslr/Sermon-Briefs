import "server-only";
import fs from "node:fs";
import zlib from "node:zlib";
import { createWorker, type Worker } from "tesseract.js";
import { config } from "../config";

/**
 * Local OCR via tesseract.js — runs entirely on this machine, costs no AI credits.
 * The English model (~5 MB) is downloaded once into data/tessdata and cached.
 */

const globalForOcr = globalThis as unknown as { __ocrWorker?: Promise<Worker> };

function getWorker(): Promise<Worker> {
  if (!globalForOcr.__ocrWorker) {
    fs.mkdirSync(config.tessdataDir, { recursive: true });
    globalForOcr.__ocrWorker = createWorker("eng", 1, {
      cachePath: config.tessdataDir,
      // Without this, a worker crash becomes an uncaught exception in the server.
      errorHandler: (err: unknown) => console.error("[ocr] worker error", err),
    }).catch(
      (err) => {
        globalForOcr.__ocrWorker = undefined; // allow retry on next call
        throw err;
      },
    );
  }
  return globalForOcr.__ocrWorker;
}

/** A crashed worker never answers; give up on an image after this long and start a fresh worker. */
const OCR_TIMEOUT_MS = 90_000;

/** Serialize recognition so concurrent jobs don't fight over the single worker. */
let queue: Promise<unknown> = Promise.resolve();

export async function ocrImage(image: Buffer): Promise<string> {
  const run = queue.then(async () => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Text recognition stopped responding.")), OCR_TIMEOUT_MS);
    });
    const pending = getWorker();
    try {
      const worker = await Promise.race([pending, timeout]);
      const { data } = await Promise.race([worker.recognize(image), timeout]);
      return cleanOcrText(data.text, data.confidence);
    } catch (err) {
      globalForOcr.__ocrWorker = undefined;
      pending.then((w) => w.terminate()).catch(() => undefined);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Drop OCR noise: stray symbols, single characters, and very low-confidence output. */
export function cleanOcrText(text: string, confidence: number): string {
  if (confidence < 35) return "";
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/(^|\s)\|(?=\s|$)/g, "$1I") // Tesseract often reads the word "I" as "|"
        .replace(/[|_~^`•·]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter((line) => (line.match(/[A-Za-z]/g)?.length ?? 0) >= 3)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder for raw pixel data (used for images embedded in PDFs).
// ---------------------------------------------------------------------------

export function encodePng(data: Uint8ClampedArray | Uint8Array, width: number, height: number, channels: number): Buffer {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : channels === 4 ? 6 : -1;
  if (colorType < 0) throw new Error(`Unsupported channel count: ${channels}`);

  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typeAndBody = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typeAndBody));
    return Buffer.concat([len, typeAndBody, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
