import { after } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { createBrief } from "@/lib/db";
import { detectKind, type UploadedFile } from "@/lib/extract";
import { processBrief } from "@/lib/jobs";
import { BriefOptionsSchema, type SourceFileInfo } from "@/lib/types";

const MetaSchema = z.object({
  title: z.string().trim().max(200).default(""),
  speaker: z.string().trim().max(120).default(""),
  sermonDate: z.string().trim().max(40).default(""),
  series: z.string().trim().max(120).default(""),
});

const badRequest = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("The upload couldn't be read. Please try again.");
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pastedText = String(form.get("pastedText") ?? "");

  if (files.length === 0 && !pastedText.trim()) {
    return badRequest("Add at least one file or paste a transcript.");
  }
  if (files.length > config.limits.maxFiles) {
    return badRequest(`You can upload up to ${config.limits.maxFiles} files at a time.`);
  }
  if (pastedText.length > config.limits.maxPastedChars) {
    return badRequest("The pasted text is too long. Upload it as a .txt file instead.");
  }
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes > config.limits.maxTotalBytes) {
    return badRequest(`Uploads are limited to ${config.limits.maxTotalBytes / 1024 / 1024} MB in total.`, 413);
  }

  const uploads: UploadedFile[] = [];
  const sources: SourceFileInfo[] = [];
  for (const file of files) {
    if (file.size > config.limits.maxFileBytes) {
      return badRequest(`${file.name} is larger than ${config.limits.maxFileBytes / 1024 / 1024} MB.`, 413);
    }
    const detected = detectKind(file.name);
    if ("error" in detected) return badRequest(detected.error, 415);
    uploads.push({ name: file.name, kind: detected.kind, buffer: Buffer.from(await file.arrayBuffer()) });
    sources.push({ name: file.name, kind: detected.kind, size: file.size });
  }
  if (pastedText.trim()) sources.push({ name: "Pasted text", kind: "pasted", size: pastedText.length });

  const meta = MetaSchema.safeParse({
    title: form.get("title") ?? undefined,
    speaker: form.get("speaker") ?? undefined,
    sermonDate: form.get("sermonDate") ?? undefined,
    series: form.get("series") ?? undefined,
  });
  if (!meta.success) return badRequest("One of the sermon details is too long.");

  let options;
  try {
    options = BriefOptionsSchema.parse(JSON.parse(String(form.get("options") ?? "{}")));
  } catch {
    return badRequest("The brief options were invalid.");
  }

  const id = createBrief({ ...meta.data, options, sources });
  // Respond right away; extraction and writing continue in the background.
  after(() => processBrief(id, uploads, pastedText));
  return Response.json({ id }, { status: 201 });
}
