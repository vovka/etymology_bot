import type { ExplorationAgent } from "./agent/ExplorationAgent.js";
import type { AppConfig } from "../config/AppConfig.js";
import type { Researcher } from "../research/Researcher.js";
import type { KeyValueStore } from "../storage/KeyValueStore.js";
import type { Answer, OnProgress } from "./Answer.js";

/** Research → explore → write: gather sources on the word, then let the agent dig further and write. */
export class EtymologyService {
  constructor(
    private readonly researcher: Researcher,
    private readonly agent: ExplorationAgent,
    private readonly store: KeyValueStore,
    private readonly cache: AppConfig["cache"],
  ) {}

  async explain(query: string, replyLanguage: string, onProgress: OnProgress): Promise<Answer> {
    const key = `etymology:v3:${replyLanguage}:${query.toLowerCase()}`;
    const cached = this.cache.enabled ? await this.store.get(key) : null;
    if (cached) return JSON.parse(cached) as Answer;
    const answer = await this.compose(query, replyLanguage, onProgress);
    if (this.cache.enabled) await this.store.set(key, JSON.stringify(answer), this.cache.ttlSeconds);
    return answer;
  }

  private async compose(query: string, replyLanguage: string, onProgress: OnProgress): Promise<Answer> {
    await onProgress({ stage: "researching" });
    const seed = await this.researcher.research(query);
    return this.agent.explore(query, replyLanguage, seed, onProgress);
  }
}
