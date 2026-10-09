import type { AppConfig } from "../config/AppConfig.js";
import type { Researcher } from "../research/Researcher.js";
import type { KeyValueStore } from "../storage/KeyValueStore.js";
import type { Answer, OnProgress } from "./Answer.js";
import type { Writer } from "./Writer.js";

/** Research → write: gather sources on the word, then let the writer (direct or agent) compose the answer. */
export class EtymologyService {
  constructor(
    private readonly researcher: Researcher,
    private readonly writer: Writer,
    private readonly store: KeyValueStore,
    private readonly cache: AppConfig["cache"],
    // Keeps each tier's answers apart, so no tier is served another tier's answer.
    private readonly cacheScope: string,
  ) {}

  async explain(query: string, replyLanguage: string, onProgress: OnProgress): Promise<Answer> {
    const key = `etymology:v5:${this.cacheScope}:${replyLanguage}:${query.toLowerCase()}`;
    const cached = this.cache.enabled ? await this.store.get(key) : null;
    if (cached) return JSON.parse(cached) as Answer;
    const answer = await this.compose(query, replyLanguage, onProgress);
    if (this.cache.enabled) await this.store.set(key, JSON.stringify(answer), this.cache.ttlSeconds);
    return answer;
  }

  private async compose(query: string, replyLanguage: string, onProgress: OnProgress): Promise<Answer> {
    await onProgress({ stage: "researching" });
    const seed = await this.researcher.research(query);
    return this.writer.write(query, replyLanguage, seed, onProgress);
  }
}
