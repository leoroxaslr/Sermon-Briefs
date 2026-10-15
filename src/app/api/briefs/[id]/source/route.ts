import { getBrief } from "@/lib/db";

/** The text we extracted from the uploads, for the "Source text" panel. */
export async function GET(_request: Request, ctx: RouteContext<"/api/briefs/[id]/source">) {
  const { id } = await ctx.params;
  const brief = getBrief(id);
  if (!brief) return Response.json({ error: "That brief doesn't exist." }, { status: 404 });
  return new Response(brief.extractedText, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
