import { after } from "next/server";
import { z } from "zod";
import { getBrief, updateBrief } from "@/lib/db";
import { regenerateBrief } from "@/lib/jobs";
import { AUDIENCES, ENGINES, SECTION_KEYS, type BriefOptions, type SectionKey } from "@/lib/types";

const BodySchema = z.object({
  engine: z.enum(ENGINES),
  audience: z.enum(AUDIENCES).optional(),
  sections: z.partialRecord(z.enum(SECTION_KEYS), z.boolean()).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/briefs/[id]/regenerate">) {
  const { id } = await ctx.params;
  const brief = getBrief(id);
  if (!brief) return Response.json({ error: "That brief doesn't exist." }, { status: 404 });
  if (brief.status === "queued" || brief.status === "extracting" || brief.status === "generating") {
    return Response.json({ error: "This brief is already being processed." }, { status: 409 });
  }
  if (!brief.extractedText.trim()) {
    return Response.json(
      { error: "There's no extracted text to work from. Upload the files again as a new brief." },
      { status: 409 },
    );
  }

  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Flip the status now so the page shows progress immediately when it polls.
  updateBrief(id, { status: "generating", progress: "Starting…", error: null });
  // Only override what the request sent; everything else keeps its saved value.
  const changes: Partial<BriefOptions> = {};
  if (body.audience) changes.audience = body.audience;
  if (body.sections) changes.sections = { ...brief.options.sections, ...(body.sections as Record<SectionKey, boolean>) };
  after(() => regenerateBrief(id, body.engine, changes));
  return Response.json({ ok: true }, { status: 202 });
}
