import type { AppConfig, ChainEntry } from "../config/AppConfig.js";
import {
  RateLimitError, type AssistantReply, type ChatMessage, type Provider, type ToolDefinition,
} from "../providers/Provider.js";
import type { CooldownTracker } from "./CooldownTracker.js";

export interface ChainLink {
  entry: ChainEntry;
  provider: Provider;
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
}

/** One model from the chain, with the request settings for it already applied. */
export interface ChatModel {
  readonly label: string;
  readonly supportsTools: boolean;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<AssistantReply>;
}

export class AllModelsUnavailableError extends Error {
  constructor() {
    super("Every model in the chain is rate-limited or failing");
    this.name = "AllModelsUnavailableError";
  }
}

/**
 * Runs a task on each model in order until one completes it. A task may make many calls (an agent loop);
 * if any of them fails, the whole task moves to the next model. Rate-limited models go on cooldown.
 */
export class ModelChain {
  constructor(
    private readonly links: ChainLink[],
    private readonly cooldowns: CooldownTracker,
    private readonly llm: AppConfig["llm"],
  ) {}

  async run<T>(task: (model: ChatModel) => Promise<T>): Promise<T> {
    for (const link of this.links) {
      if (await this.cooldowns.isCoolingDown(link.entry)) continue;
      try {
        return await task(this.bind(link));
      } catch (error) {
        await this.handleFailure(link.entry, error);
      }
    }
    throw new AllModelsUnavailableError();
  }

  private bind({ entry, provider }: ChainLink): ChatModel {
    const { maxTokens, requestTimeoutMs } = this.llm;
    const temperature = entry.temperature === undefined ? this.llm.temperature : (entry.temperature ?? undefined);
    return {
      label: `${entry.provider}/${entry.model}`,
      supportsTools: entry.tools,
      chat: (messages, options = {}) => provider.chat({
        model: entry.model, messages, maxTokens, temperature, timeoutMs: requestTimeoutMs,
        extraBody: entry.extraBody, ...options,
      }),
    };
  }

  private async handleFailure(entry: ChainEntry, error: unknown): Promise<void> {
    const label = `${entry.provider}/${entry.model}`;
    if (!(error instanceof RateLimitError)) return console.warn(`${label} failed:`, String(error));
    const seconds = await this.cooldowns.coolDown(entry, error);
    console.warn(`${label} rate-limited, cooling down for ${seconds}s`);
  }
}
