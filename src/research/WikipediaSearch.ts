import { decodeHtmlEntities } from "../utils/decodeHtmlEntities.js";
import type { HttpGet } from "./Source.js";

export interface SearchHit {
  title: string;
  description: string;
}

interface SearchResponse {
  pages?: { title: string; description?: string | null; excerpt?: string | null }[];
}

/** Finds article titles to read next; the hits are pointers, not citable sources. */
export class WikipediaSearch {
  constructor(private readonly get: HttpGet, private readonly language = "en") {}

  async search(query: string): Promise<SearchHit[]> {
    const api = `https://${this.language}.wikipedia.org/w/rest.php/v1/search/page?limit=5&q=`;
    const response = await this.get(api + encodeURIComponent(query));
    if (!response.ok) return [];
    const data = (await response.json()) as SearchResponse;
    return (data.pages ?? []).map(({ title, description, excerpt }) => ({
      title,
      description: decodeHtmlEntities((description || excerpt || "").replace(/<[^>]*>/g, "")),
    }));
  }
}
