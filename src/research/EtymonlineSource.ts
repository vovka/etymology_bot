import { decodeHtmlEntities } from "../utils/decodeHtmlEntities.js";
import type { HttpGet, Source, SourceDocument } from "./Source.js";

const META_TAG = /<meta\b[^>]*>/gi;
const IS_DESCRIPTION = /\b(?:name|property)=["'](?:og:)?description["']/i;
const CONTENT = /\bcontent=(["'])(.*?)\1/i;

/** Etymonline has no API; this reads the entry summary from the page's meta description. */
export class EtymonlineSource implements Source {
  constructor(private readonly get: HttpGet) {}

  async lookup(query: string): Promise<SourceDocument | null> {
    const url = `https://www.etymonline.com/word/${encodeURIComponent(query.toLowerCase())}`;
    const response = await this.get(url);
    if (!response.ok) return null;
    const text = extractDescription(await response.text());
    return text ? { name: "Etymonline", url, text } : null;
  }
}

export function extractDescription(html: string): string | null {
  const tag = html.match(META_TAG)?.find((candidate) => IS_DESCRIPTION.test(candidate));
  const content = tag?.match(CONTENT)?.[2];
  return content ? decodeHtmlEntities(content) : null;
}
