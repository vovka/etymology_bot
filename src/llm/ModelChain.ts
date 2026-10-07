import type { AppConfig, ChainEntry } from "../config/AppConfig.js";
import { RateLimitError, type ChatMessage, type CompletionRequest, type Provider } from "../providers/Provider.js";
import type { CooldownTracker } from "./CooldownTracker.js";

export interface ChainLink {
  entry: ChainEntry;
  provider: Provider;
}

export class AllModelsUnavailableError extends Error {
  constructor() {
    super("Every model in the chain is rate-limited or failing");
    this.name = "AllModelsUnavailableError";
  }
}

/** Tries each model in order; rate-limited ones go on cooldown, other failures just fall through. */
export class ModelChain {
  constructor(
    private readonly links: ChainLink[],
    private readonly cooldowns: CooldownTracker,
    private readonly llm: AppConfig["llm"],
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    for (const link of this.links) {
      if (await this.cooldowns.isCoolingDown(link.entry)) continue;
      const result = await this.tryLink(link, messages);
      if (result !== null) return result;
    }
    throw new AllModelsUnavailableError();
  }

  private async tryLink({ entry, provider }: ChainLink, messages: ChatMessage[]): Promise<string | null> {
    try {
      return await provider.complete(this.request(entry, messages));
    } catch (error) {
      await this.handleFailure(entry, error);
      return null;
    }
  }

  private request(entry: ChainEntry, messages: ChatMessage[]): CompletionRequest {
    const { maxTokens, temperature, requestTimeoutMs } = this.llm;
    const { model, extraBody } = entry;
    return { model, messages, maxTokens, temperature, timeoutMs: requestTimeoutMs, extraBody };
  }

  private async handleFailure(entry: ChainEntry, error: unknown): Promise<void> {
    const label = `${entry.provider}/${entry.model}`;
    if (!(error instanceof RateLimitError)) return console.warn(`${label} failed:`, String(error));
    const seconds = await this.cooldowns.coolDown(entry, error);
    console.warn(`${label} rate-limited, cooling down for ${seconds}s`);
  }
}
