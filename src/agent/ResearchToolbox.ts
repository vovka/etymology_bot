import { z } from "zod";
import type { ToolCall, ToolDefinition } from "../providers/Provider.js";
import { EtymonlineSource } from "../research/EtymonlineSource.js";
import { searchWikipedia } from "../research/searchWikipedia.js";
import type { HttpGet, SourceDocument } from "../research/Source.js";
import { WikipediaSource } from "../research/WikipediaSource.js";
import { WiktionarySource } from "../research/WiktionarySource.js";
import type { SourceRegistry } from "./SourceRegistry.js";

const term = z.string().trim().min(1).max(120);
// Wikipedia subdomains only ("de", "zh-yue", "simple"), so a model can't point requests at another host.
const language = z.string().regex(/^[a-z]{2,3}(-[a-z]+)*$|^simple$/).default("en")
  .describe('Wikipedia language code, e.g. "en", "de", "la", "ja". Default "en".');

const schemas = {
  wiktionary: z.object({ term }),
  etymonline: z.object({ term }),
  wikipedia: z.object({ title: term, language }),
  wikipedia_search: z.object({ query: term, language }),
};
type ToolName = keyof typeof schemas;

const descriptions: Record<ToolName, string> = {
  wiktionary:
    "Read the etymology and descendants sections of an English Wiktionary entry. Wiktionary covers words of " +
    "every language, so use it to follow a word back through its ancestors, to check cognates and words " +
    "sharing a root, and to read reconstructed roots. Page titles drop Latin and Old English macrons " +
    '("salarium", not "salārium"). For a reconstruction, turn a template such as {{der|en|ine-pro|*seh₂l-}} ' +
    'into the title "Reconstruction:Proto-Indo-European/seh₂l-".',
  etymonline: "Read the Online Etymology Dictionary entry for an English word: dates of first use and origin.",
  wikipedia:
    "Read the summary of a Wikipedia article: people, places, events, customs or objects a word is named " +
    "after or tied to. Pick the language edition where the topic is best covered.",
  wikipedia_search:
    "Search Wikipedia for article titles when you don't know the exact one. Returns titles and short " +
    "descriptions to read next with the wikipedia tool; the results themselves are not citable.",
};

/** The research tools the model can call. Results that are documents get a citation number. */
export class ResearchToolbox {
  readonly definitions: ToolDefinition[] = (Object.keys(schemas) as ToolName[]).map((name) => {
    const { $schema: _, ...parameters } = z.toJSONSchema(schemas[name], { io: "input" });
    return { name, description: descriptions[name], parameters };
  });

  // The same lookup is never fetched twice per question, even when a fallback model repeats it.
  private readonly results = new Map<string, Promise<string>>();

  constructor(
    private readonly get: HttpGet,
    private readonly registry: SourceRegistry,
    private readonly maxCharsPerSource: number,
  ) {}

  /** Never throws: failures come back as text the model can react to. */
  run(call: ToolCall): Promise<string> {
    const key = `${call.name}:${call.arguments}`;
    if (!this.results.has(key)) {
      this.results.set(key, this.execute(call).catch((error) => `Error: ${String(error)}`));
    }
    return this.results.get(key)!;
  }

  /** A short label for the progress message, e.g. 'Wiktionary «salarium»'. */
  describe(call: ToolCall): string {
    const args = parseJson(call.arguments) as Record<string, unknown> | null;
    const subject = args?.term ?? args?.title ?? args?.query;
    const label = { wiktionary: "Wiktionary", etymonline: "Etymonline", wikipedia: "Wikipedia",
      wikipedia_search: "Wikipedia search" }[call.name as ToolName] ?? call.name;
    return typeof subject === "string" ? `${label} «${subject}»` : label;
  }

  private async execute(call: ToolCall): Promise<string> {
    if (!(call.name in schemas)) return `Error: unknown tool "${call.name}".`;
    const name = call.name as ToolName;
    const parsed = schemas[name].safeParse(parseJson(call.arguments));
    if (!parsed.success) return `Error: invalid arguments: ${z.prettifyError(parsed.error)}`;
    const args = parsed.data as Record<string, string>;
    switch (name) {
      case "wiktionary":
        return this.document(new WiktionarySource(this.get, ["Etymology", "Descendants"]).lookup(args.term), args.term);
      case "etymonline":
        return this.document(new EtymonlineSource(this.get).lookup(args.term), args.term);
      case "wikipedia":
        return this.document(new WikipediaSource(this.get, args.language).lookup(args.title), args.title);
      case "wikipedia_search":
        return this.search(args.query, args.language);
    }
  }

  private async document(lookup: Promise<SourceDocument | null>, subject: string): Promise<string> {
    const document = await lookup;
    if (!document) return `Nothing found for "${subject}".`;
    const source = this.registry.add({ ...document, text: document.text.slice(0, this.maxCharsPerSource) });
    return `Source [${source.number}] ${source.name} (${source.url})\n${source.text}`;
  }

  private async search(query: string, language: string): Promise<string> {
    const hits = await searchWikipedia(this.get, query, language);
    if (hits.length === 0) return `No articles found for "${query}".`;
    return hits.map((hit) => `- ${hit.title}${hit.description ? `: ${hit.description}` : ""}`).join("\n");
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
