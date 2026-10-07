import type { AppConfig } from "../config/AppConfig.js";
import type { ModelChain } from "../llm/ModelChain.js";
import type { Researcher } from "../research/Researcher.js";
import type { KeyValueStore } from "../storage/KeyValueStore.js";
import type { Answer, OnStage } from "./Answer.js";
import { buildPrompt } from "./buildPrompt.js";

/** Research → write pipeline: gather reference sources first, then let the model write a grounded answer. */
export class EtymologyService {
  constructor(
    private readonly researcher: Researcher,
    private readonly chain: ModelChain,
    private readonly store: KeyValueStore,
    private readonly cache: AppConfig["cache"],
  ) {}

  async explain(query: string, replyLanguage: string, onStage: OnStage): Promise<Answer> {
    const key = `etymology:v2:${replyLanguage}:${query.toLowerCase()}`;
    const cached = this.cache.enabled ? await this.store.get(key) : null;
    if (cached) return JSON.parse(cached) as Answer;
    const answer = await this.compose(query, replyLanguage, onStage);
    if (this.cache.enabled) await this.store.set(key, JSON.stringify(answer), this.cache.ttlSeconds);
    return answer;
  }

  private async compose(query: string, replyLanguage: string, onStage: OnStage): Promise<Answer> {
    await onStage("researching");
    const sources = await this.researcher.research(query);
    await onStage("writing");
    const text = await this.chain.complete(buildPrompt(query, replyLanguage, sources));
    return { text, sources: sources.map(({ name, url }) => ({ name, url })) };
  }
}
