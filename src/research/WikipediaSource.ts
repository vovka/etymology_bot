import type { HttpGet, Source, SourceDocument } from "./Source.js";

const API = "https://en.wikipedia.org/api/rest_v1/page/summary/";

interface Summary {
  type?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Background for stories: eponyms, places, historical context. */
export class WikipediaSource implements Source {
  constructor(private readonly get: HttpGet) {}

  async lookup(query: string): Promise<SourceDocument | null> {
    const response = await this.get(API + encodeURIComponent(query.replace(/ /g, "_")));
    if (!response.ok) return null;
    const summary = (await response.json()) as Summary;
    const url = summary.content_urls?.desktop?.page;
    if (summary.type === "disambiguation" || !summary.extract || !url) return null;
    return { name: "Wikipedia", url, text: summary.extract };
  }
}
