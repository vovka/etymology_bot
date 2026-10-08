import { z } from "zod";
import type { ToolCall, ToolDefinition } from "../../providers/Provider.js";
import { EtymonlineSource } from "../../research/EtymonlineSource.js";
import type { HttpGet, SourceDocument } from "../../research/Source.js";
import { WikipediaSearch } from "../../research/WikipediaSearch.js";
import { WikipediaSource } from "../../research/WikipediaSource.js";
import { WiktionarySource } from "../../research/WiktionarySource.js";
import { parseJson } from "../../utils/parseJson.js";
import { researchTools, type ResearchToolName } from "./researchTools.js";
import type { SourceRegistry } from "./SourceRegistry.js";

type Args = Record<string, string>;

/** Runs the research tools the model calls. Results that are documents get a citation number. */
export class ResearchToolbox {
  readonly definitions: ToolDefinition[] = Object.entries(researchTools).map(([name, tool]) => {
    const { $schema: _, ...parameters } = z.toJSONSchema(tool.schema, { io: "input" });
    return { name, description: tool.description, parameters };
  });

  // The same lookup is never fetched twice per question, even when a fallback model repeats it.
  private readonly results = new Map<string, Promise<string>>();

  private readonly handlers: Record<ResearchToolName, (args: Args) => Promise<string>> = {
    wiktionary: ({ term }) =>
      this.document(new WiktionarySource(this.get, ["Etymology", "Descendants"]).lookup(term), term),
    etymonline: ({ term }) => this.document(new EtymonlineSource(this.get).lookup(term), term),
    wikipedia: ({ title, language }) => this.document(new WikipediaSource(this.get, language).lookup(title), title),
    wikipedia_search: ({ query, language }) => this.search(query, language),
  };

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
    const label = researchTools[call.name as ResearchToolName]?.label ?? call.name;
    const args = parseJson(call.arguments) as Args | null;
    const subject = args?.term ?? args?.title ?? args?.query;
    return typeof subject === "string" ? `${label} «${subject}»` : label;
  }

  private async execute(call: ToolCall): Promise<string> {
    if (!(call.name in researchTools)) return `Error: unknown tool "${call.name}".`;
    const name = call.name as ResearchToolName;
    const parsed = researchTools[name].schema.safeParse(parseJson(call.arguments));
    if (!parsed.success) return `Error: invalid arguments: ${z.prettifyError(parsed.error)}`;
    return this.handlers[name](parsed.data as Args);
  }

  private async document(lookup: Promise<SourceDocument | null>, subject: string): Promise<string> {
    const document = await lookup;
    if (!document) return `Nothing found for "${subject}".`;
    const source = this.registry.add({ ...document, text: document.text.slice(0, this.maxCharsPerSource) });
    return `Source [${source.number}] ${source.name} (${source.url})\n${source.text}`;
  }

  private async search(query: string, language: string): Promise<string> {
    const hits = await new WikipediaSearch(this.get, language).search(query);
    if (hits.length === 0) return `No articles found for "${query}".`;
    return hits.map((hit) => `- ${hit.title}${hit.description ? `: ${hit.description}` : ""}`).join("\n");
  }
}
