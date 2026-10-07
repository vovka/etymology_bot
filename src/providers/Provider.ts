export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  extraBody: Record<string, unknown>;
}

/** Implement this to add a provider with a non-OpenAI-compatible API. */
export interface Provider {
  complete(request: CompletionRequest): Promise<string>;
}

/** The model is out of quota for now; the chain puts it on cooldown and moves on. */
export class RateLimitError extends Error {
  constructor(message: string, readonly retryAfterSeconds?: number, readonly isDailyQuota = false) {
    super(message);
    this.name = "RateLimitError";
  }
}
