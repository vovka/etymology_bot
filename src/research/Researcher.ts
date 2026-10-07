import type { Source, SourceDocument } from "./Source.js";

/** Queries all sources in parallel; a failing source is logged and left out rather than failing the answer. */
export class Researcher {
  constructor(private readonly sources: Source[], private readonly maxCharsPerSource: number) {}

  async research(query: string): Promise<SourceDocument[]> {
    const results = await Promise.allSettled(this.sources.map((source) => source.lookup(query)));
    return results.flatMap((result) => {
      if (result.status === "rejected") console.warn("Research source failed:", String(result.reason));
      if (result.status !== "fulfilled" || !result.value) return [];
      return [{ ...result.value, text: result.value.text.slice(0, this.maxCharsPerSource) }];
    });
  }
}
