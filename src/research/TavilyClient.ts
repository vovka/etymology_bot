import type { AppConfig } from "../config/AppConfig.js";

const API_URL = "https://api.tavily.com";

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

/** Web search and page reading through Tavily (https://tavily.com); Tavily fetches the pages, not this server. */
export class TavilyClient {
  constructor(
    private readonly apiKey: string,
    private readonly config: AppConfig["web"],
  ) {}

  async search(query: string): Promise<WebResult[]> {
    const body = await this.post("search", { query, max_results: this.config.maxResults, search_depth: "basic" });
    return (body.results as WebResult[] | undefined) ?? [];
  }

  /** The page's text, or null when Tavily could not read it. */
  async extract(url: string): Promise<string | null> {
    const body = await this.post("extract", { urls: [url], format: "text" });
    const results = body.results as { raw_content?: string }[] | undefined;
    return results?.[0]?.raw_content || null;
  }

  private async post(endpoint: string, payload: object): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_URL}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    // 429: rate limit; 432: the plan's monthly credits are used up.
    if (!response.ok) throw new Error(`Tavily ${endpoint} failed: ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
}
