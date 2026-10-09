import { z } from "zod";

const term = z.string().trim().min(1).max(120);
// Wikipedia subdomains only ("de", "zh-yue"), so a model can't point requests at another host.
const language = z.string().regex(/^[a-z]{2,3}(-[a-z]+)*$/).default("en")
  .describe('Wikipedia language code, e.g. "en", "de", "la", "ja". Default "en".');

/** Each research tool's arguments and progress label; descriptions live in config/prompts/tools/. */
export const researchTools = {
  wiktionary: {
    label: "Wiktionary",
    schema: z.object({ term }),
  },
  etymonline: {
    label: "Etymonline",
    schema: z.object({ term }),
  },
  wikipedia: {
    label: "Wikipedia",
    schema: z.object({ title: term, language }),
  },
  wikipedia_search: {
    label: "Wikipedia search",
    schema: z.object({ query: term, language }),
  },
  // Web tools are offered only on tiers with webSearch: true.
  web_search: {
    label: "Web",
    schema: z.object({ query: z.string().trim().min(1).max(200) }),
  },
  read_page: {
    label: "Page",
    schema: z.object({ url: z.url({ protocol: /^https?$/ }) }),
  },
};

export const WEB_TOOLS: readonly ResearchToolName[] = ["web_search", "read_page"];

export type ResearchToolName = keyof typeof researchTools;
