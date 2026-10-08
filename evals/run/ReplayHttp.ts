import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HttpGet } from "../../src/research/Source.js";

interface Recorded {
  status: number;
  body: string;
}

/**
 * Serves recorded responses, so every model reads exactly the same pages and runs are comparable.
 * Pages not recorded yet are fetched live and kept; delete the file to record afresh.
 */
export class ReplayHttp {
  private readonly recorded: Record<string, Recorded>;
  private changed = false;

  constructor(private readonly live: HttpGet, private readonly filePath: string) {
    this.recorded = existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : {};
  }

  readonly get: HttpGet = async (url) => {
    const { status, body } = this.recorded[url] ?? (await this.fetchLive(url));
    return new Response(body, { status });
  };

  save(): void {
    if (!this.changed) return;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.recorded, null, 1));
    this.changed = false;
  }

  /**
   * Only pages and 404s (no such page) are kept. Errors, rate limits and blocked requests are passed
   * through, so a later run retries them instead of replaying a failure.
   */
  private async fetchLive(url: string): Promise<Recorded> {
    const response = await this.live(url);
    const recorded = { status: response.status, body: await response.text() };
    if (!response.ok && response.status !== 404) return recorded;
    this.recorded[url] = recorded;
    this.changed = true;
    return recorded;
  }
}
