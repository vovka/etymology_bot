import type { HttpGet, Source, SourceDocument } from "./Source.js";

const API = "https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1";
const HEADING = /^(=+)\s*(.+?)\s*\1\s*$/;

/** Reads the Etymology sections of the English Wiktionary entry, which covers words of every language. */
export class WiktionarySource implements Source {
  constructor(private readonly get: HttpGet) {}

  async lookup(query: string): Promise<SourceDocument | null> {
    for (const title of new Set([query, query.toLowerCase()])) {
      const wikitext = await this.fetchWikitext(title);
      const text = wikitext && extractEtymologies(wikitext);
      if (text) return { name: "Wiktionary", url: `https://en.wiktionary.org/wiki/${encodeURIComponent(title)}`, text };
    }
    return null;
  }

  private async fetchWikitext(title: string): Promise<string | null> {
    const response = await this.get(`${API}&page=${encodeURIComponent(title)}`);
    const data = (await response.json()) as { parse?: { wikitext?: string } };
    return data.parse?.wikitext ?? null;
  }
}

/** Keeps each "Etymology" section, prefixed with the language it belongs to. */
export function extractEtymologies(wikitext: string): string {
  const sections: string[][] = [];
  let language = "";
  let current: string[] | null = null;
  for (const line of wikitext.split("\n")) {
    const heading = line.match(HEADING);
    if (!heading) {
      if (line.trim()) current?.push(line);
      continue;
    }
    if (heading[1].length === 2) language = heading[2];
    current = heading[2].startsWith("Etymology") ? [`[${language}] ${heading[2]}:`] : null;
    if (current) sections.push(current);
  }
  return sections.filter((lines) => lines.length > 1).map((lines) => lines.join("\n")).join("\n\n");
}
