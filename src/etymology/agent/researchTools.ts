import { z } from "zod";

const term = z.string().trim().min(1).max(120);
// Wikipedia subdomains only ("de", "zh-yue"), so a model can't point requests at another host.
const language = z.string().regex(/^[a-z]{2,3}(-[a-z]+)*$/).default("en")
  .describe('Wikipedia language code, e.g. "en", "de", "la", "ja". Default "en".');

/** What the model sees of each research tool, and the label shown in the progress message. */
export const researchTools = {
  wiktionary: {
    label: "Wiktionary",
    schema: z.object({ term }),
    description:
      "Read the etymology and descendants sections of an English Wiktionary entry. Wiktionary covers words " +
      "of every language, so use it to follow a word back through its ancestors, to check cognates and words " +
      "sharing a root, and to read reconstructed roots. Page titles drop Latin and Old English macrons " +
      '("salarium", not "salārium"). For a reconstruction, turn a template such as {{der|en|ine-pro|*seh₂l-}} ' +
      'into the title "Reconstruction:Proto-Indo-European/seh₂l-".',
  },
  etymonline: {
    label: "Etymonline",
    schema: z.object({ term }),
    description: "Read the Online Etymology Dictionary entry for an English word: dates of first use and origin.",
  },
  wikipedia: {
    label: "Wikipedia",
    schema: z.object({ title: term, language }),
    description:
      "Read the summary of a Wikipedia article: people, places, events, customs or objects a word is named " +
      "after or tied to. Pick the language edition where the topic is best covered.",
  },
  wikipedia_search: {
    label: "Wikipedia search",
    schema: z.object({ query: term, language }),
    description:
      "Search Wikipedia for article titles when you don't know the exact one. Returns titles and short " +
      "descriptions to read next with the wikipedia tool; the results themselves are not citable.",
  },
};

export type ResearchToolName = keyof typeof researchTools;
