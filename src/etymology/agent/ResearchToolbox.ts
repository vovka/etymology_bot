import { z } from "zod";
import { loadPrompt } from "../../config/loadPrompt.js";
import type { ToolCall, ToolDefinition } from "../../providers/Provider.js";
import { EtymonlineSource } from "../../research/EtymonlineSource.js";
import type { HttpGet, SourceDocument } from "../../research/Source.js";
import type { TavilyClient } from "../../research/TavilyClient.js";
import { WikipediaSearch } from "../../research/WikipediaSearch.js";
import { WikipediaSource } from "../../research/WikipediaSource.js";
import { WiktionarySource } from "../../research/WiktionarySource.js";
import { parseJson } from "../../utils/parseJson.js";
import { researchTools, WEB_TOOLS, type ResearchToolName } from "./researchTools.js";
import { citedNumbers, type SourceRegistry } from "./SourceRegistry.js";

type Args = Record<string, string>;

/** Runs the research tools the model calls. Results that are documents get a citation number. */
export class ResearchToolbox {
  readonly definitions: ToolDefinition[];

  // The same lookup is never fetched twice per question, even when a fallback model repeats it.
  private readonly results = new Map<string, Promise<string>>();
  private readonly webSources = new Set<number>();

  private readonly handlers: Record<ResearchToolName, (args: Args) => Promise<string>> = {
    wiktionary: ({ term }) =>
      this.document(new WiktionarySource(this.get, ["Etymology", "Descendants"]).lookup(term), term),
    etymonline: ({ term }) => this.document(new EtymonlineSource(this.get).lookup(term), term),
    wikipedia: ({ title, language }) => this.document(new WikipediaSource(this.get, language).lookup(title), title),
    wikipedia_search: ({ query, language }) => this.search(query, language),
    web_search: ({ query }) => this.searchWeb(query),
    read_page: ({ url }) => this.document(this.readPage(url), url, true),
  };

  /** Without a web client, the web tools are not offered. */
  constructor(
    private readonly get: HttpGet,
    private readonly registry: SourceRegistry,
    private readonly maxCharsPerSource: number,
    private readonly web?: TavilyClient,
  ) {
    const names = Object.keys(researchTools) as ResearchToolName[];
    this.definitions = names.filter((name) => web || !WEB_TOOLS.includes(name)).map(toolDefinition);
  }

  /** Whether the text cites a source found on the open web. */
  citesWebSource(text: string): boolean {
    return citedNumbers(text).some((number) => this.webSources.has(number));
  }

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
    const subject = args?.term ?? args?.title ?? args?.query ?? args?.url;
    return typeof subject === "string" ? `${label} «${subject}»` : label;
  }

  private async execute(call: ToolCall): Promise<string> {
    if (!this.definitions.some((tool) => tool.name === call.name)) return `Error: unknown tool "${call.name}".`;
    const name = call.name as ResearchToolName;
    const parsed = researchTools[name].schema.safeParse(parseJson(call.arguments));
    if (!parsed.success) return `Error: invalid arguments: ${z.prettifyError(parsed.error)}`;
    return this.handlers[name](parsed.data as Args);
  }

  private async document(lookup: Promise<SourceDocument | null>, subject: string, fromWeb = false): Promise<string> {
    const document = await lookup;
    if (!document) return `Nothing found for "${subject}".`;
    return this.register(document, fromWeb);
  }

  /** Shows the text just read, even when the URL was registered before (a search snippet, then the full page). */
  private register(document: SourceDocument, fromWeb: boolean): string {
    const text = document.text.slice(0, this.maxCharsPerSource);
    const source = this.registry.add({ ...document, text });
    if (fromWeb) this.webSources.add(source.number);
    return `Source [${source.number}] ${source.name} (${source.url})\n${text}`;
  }

  private async searchWeb(query: string): Promise<string> {
    const results = await this.web!.search(query);
    if (results.length === 0) return `No web results for "${query}".`;
    const documents = results.map(({ title, url, content }) =>
      ({ name: hostOf(url), url, text: `${title}\n${content}` }));
    return documents.map((document) => this.register(document, true)).join("\n\n");
  }

  private async readPage(url: string): Promise<SourceDocument | null> {
    const text = await this.web!.extract(url);
    return text ? { name: hostOf(url), url, text } : null;
  }

  private async search(query: string, language: string): Promise<string> {
    const hits = await new WikipediaSearch(this.get, language).search(query);
    if (hits.length === 0) return `No articles found for "${query}".`;
    return hits.map((hit) => `- ${hit.title}${hit.description ? `: ${hit.description}` : ""}`).join("\n");
  }
}

function toolDefinition(name: ResearchToolName): ToolDefinition {
  const { $schema: _, ...parameters } = z.toJSONSchema(researchTools[name].schema, { io: "input" });
  return { name, description: loadPrompt(`tools/${name}`), parameters };
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}
