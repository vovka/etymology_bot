export interface ToolCall {
  id: string;
  name: string;
  /** JSON text exactly as the model produced it; it may be malformed. */
  arguments: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCall[];
      /** Provider-specific fields that must be sent back unchanged, e.g. reasoning blocks. */
      providerData?: Record<string, unknown>;
    }
  | { role: "tool"; toolCallId: string; content: string };

export type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Omitted from the request when undefined; some models reject anything but their default. */
  temperature?: number;
  timeoutMs: number;
  extraBody: Record<string, unknown>;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
}

export interface AssistantReply {
  content: string;
  toolCalls: ToolCall[];
  /** The reply as it must be appended to the conversation to continue it. */
  message: AssistantMessage;
}

/** Implement this to add a provider with a non-OpenAI-compatible API. */
export interface Provider {
  chat(request: ChatRequest): Promise<AssistantReply>;
}

/** The model is out of quota for now; the chain puts it on cooldown and moves on. */
export class RateLimitError extends Error {
  constructor(message: string, readonly retryAfterSeconds?: number, readonly isDailyQuota = false) {
    super(message);
    this.name = "RateLimitError";
  }
}
