export interface SourceDocument {
  name: string;
  url: string;
  text: string;
}

export type HttpGet = (url: string) => Promise<Response>;

/** Implement this and register it in createSources.ts to add a new reference source. */
export interface Source {
  lookup(query: string): Promise<SourceDocument | null>;
}
