import type { SourceDocument } from "../research/Source.js";

export interface NumberedSource extends SourceDocument {
  number: number;
}

// "[3]", "[1, 4]", "[2–5]" and similar citation markers.
const CITATION = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

/** Numbers every source as it is found, so citations stay stable across tool calls and model fallbacks. */
export class SourceRegistry {
  private readonly sources: NumberedSource[] = [];

  constructor(initial: SourceDocument[] = []) {
    initial.forEach((document) => this.add(document));
  }

  add(document: SourceDocument): NumberedSource {
    const existing = this.sources.find((source) => source.url === document.url);
    if (existing) return existing;
    const source = { ...document, number: this.sources.length + 1 };
    this.sources.push(source);
    return source;
  }

  all(): readonly NumberedSource[] {
    return this.sources;
  }

  /** The sources the text cites, or all of them when it cites none. */
  citedIn(text: string): NumberedSource[] {
    const cited = new Set([...text.matchAll(CITATION)].flatMap((match) => match[1].split(/\D+/).map(Number)));
    const sources = this.sources.filter((source) => cited.has(source.number));
    return sources.length > 0 ? sources : [...this.sources];
  }
}
