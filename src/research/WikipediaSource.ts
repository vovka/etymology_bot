import type { HttpGet, Source, SourceDocument } from "./Source.js";

interface Summary {
  type?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Background for stories: eponyms, places, historical context. Any language edition of Wikipedia. */
export class WikipediaSource implements Source {
  constructor(private readonly get: HttpGet, private readonly language = "en") {}

  async lookup(query: string): Promise<SourceDocument | null> {
    const api = `https://${this.language}.wikipedia.org/api/rest_v1/page/summary/`;
    const response = await this.get(api + encodeURIComponent(query.replace(/ /g, "_")));
    if (!response.ok) return null;
    const summary = (await response.json()) as Summary;
    const url = summary.content_urls?.desktop?.page;
    if (summary.type === "disambiguation" || !summary.extract || !url) return null;
    const name = this.language === "en" ? "Wikipedia" : `Wikipedia (${this.language})`;
    return { name, url, text: summary.extract };
  }
}
