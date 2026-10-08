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
export async function searchWikipedia(get: HttpGet, query: string, language = "en", limit = 5): Promise<SearchHit[]> {
  const url = `https://${language}.wikipedia.org/w/rest.php/v1/search/page?limit=${limit}&q=${encodeURIComponent(query)}`;
  const response = await get(url);
  if (!response.ok) return [];
  const data = (await response.json()) as SearchResponse;
  return (data.pages ?? []).map(({ title, description, excerpt }) => ({
    title,
    description: decodeHtmlEntities((description || excerpt || "").replace(/<[^>]*>/g, "")),
  }));
}
