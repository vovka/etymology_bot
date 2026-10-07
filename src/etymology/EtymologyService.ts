import type { AppConfig } from "../config/AppConfig.js";
import type { ModelChain } from "../llm/ModelChain.js";
import type { KeyValueStore } from "../storage/KeyValueStore.js";
import { buildPrompt } from "./buildPrompt.js";

export class EtymologyService {
  constructor(
    private readonly chain: ModelChain,
    private readonly store: KeyValueStore,
    private readonly cache: AppConfig["cache"],
  ) {}

  async explain(query: string, replyLanguage: string): Promise<string> {
    const key = `etymology:v1:${replyLanguage}:${query.toLowerCase()}`;
    const cached = this.cache.enabled ? await this.store.get(key) : null;
    if (cached) return cached;
    const answer = await this.chain.complete(buildPrompt(query, replyLanguage));
    if (this.cache.enabled) await this.store.set(key, answer, this.cache.ttlSeconds);
    return answer;
  }
}
