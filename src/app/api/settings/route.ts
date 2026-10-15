import { z } from "zod";
import { getTavilyUsage, TavilyError } from "@/lib/ai/tavily";
import { maskKey, saveSettings, tavilySettings } from "@/lib/settings";

const BodySchema = z.object({
  /** A new key to test and save; an empty string removes the saved key. */
  tavilyApiKey: z.string().trim().max(200).optional(),
  tavilyModel: z.enum(["mini", "pro"]).optional(),
});

export async function PUT(request: Request) {
  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.tavilyApiKey) {
    // Check the key with Tavily's usage endpoint (free) before saving it.
    try {
      await getTavilyUsage(body.tavilyApiKey);
    } catch (err) {
      const message = err instanceof TavilyError ? err.message : "Couldn't reach Tavily to check the key.";
      return Response.json({ error: message }, { status: 400 });
    }
  }

  saveSettings({
    ...(body.tavilyApiKey !== undefined ? { tavilyApiKey: body.tavilyApiKey } : {}),
    ...(body.tavilyModel ? { tavilyModel: body.tavilyModel } : {}),
  });
  const now = tavilySettings();
  return Response.json({ source: now.source, maskedKey: maskKey(now.apiKey), model: now.model });
}
