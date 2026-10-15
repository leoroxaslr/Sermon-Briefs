import type { Audience } from "../types";

export type { BriefMeta } from "../types";

export const AUDIENCE_GUIDANCE: Record<Audience, string> = {
  congregation: "the whole church; warm, accessible, and suitable for a handout or bulletin insert.",
  "small-group": "small groups meeting during the week; questions should invite honest discussion.",
  youth: "teenagers; use simple, direct language and concrete, everyday examples.",
  leaders: "church leaders and staff; questions can go deeper into application and leadership.",
};
