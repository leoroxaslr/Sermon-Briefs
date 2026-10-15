import { deleteBrief, getBrief, updateBrief } from "@/lib/db";
import { BriefContentSchema } from "@/lib/types";

const notFound = () => Response.json({ error: "That brief doesn't exist." }, { status: 404 });

export async function GET(_request: Request, ctx: RouteContext<"/api/briefs/[id]">) {
  const { id } = await ctx.params;
  const brief = getBrief(id);
  if (!brief) return notFound();
  // The extracted text can be large; the page asks for it separately when shown.
  const { extractedText, ...rest } = brief;
  return Response.json({ ...rest, hasSourceText: extractedText.length > 0 }, { headers: { "Cache-Control": "no-store" } });
}

/** Save edits made in the brief editor. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/briefs/[id]">) {
  const { id } = await ctx.params;
  const brief = getBrief(id);
  if (!brief) return notFound();
  if (brief.status !== "ready") {
    return Response.json({ error: "Wait for the brief to finish before editing it." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = BriefContentSchema.safeParse((body as { content?: unknown })?.content);
  if (!parsed.success) return Response.json({ error: "The edited brief was invalid." }, { status: 400 });

  const content = parsed.data;
  updateBrief(id, {
    content,
    // Saved edits count as the user's own details, so regenerating keeps them.
    meta: { title: content.title, speaker: content.speaker, sermonDate: content.date, series: content.series },
    title: content.title,
    speaker: content.speaker,
    sermonDate: content.date,
    series: content.series,
  });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/briefs/[id]">) {
  const { id } = await ctx.params;
  return deleteBrief(id) ? new Response(null, { status: 204 }) : notFound();
}
