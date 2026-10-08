import type { ProviderConfig } from "../config/AppConfig.js";
import type {
  AssistantMessage, AssistantReply, ChatMessage, ChatRequest, Provider, ToolCall, ToolDefinition,
} from "./Provider.js";
import { rateLimitFromResponse } from "./rateLimitFromResponse.js";

interface WireToolCall {
  id: string;
  type?: "function";
  function: { name: string; arguments: string };
}

interface WireMessage {
  content?: string | null;
  tool_calls?: WireToolCall[];
  // OpenRouter returns reasoning blocks here; Claude models need them back to continue after a tool call.
  reasoning_details?: unknown;
}

interface ChatCompletionResponse {
  choices?: { message?: WireMessage }[];
}

/** Works for any API exposing POST {baseUrl}/chat/completions: OpenRouter, Groq, Together, Mistral, etc. */
export class OpenAICompatibleProvider implements Provider {
  constructor(private readonly config: ProviderConfig, private readonly apiKey: string) {}

  async chat(request: ChatRequest): Promise<AssistantReply> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.body(request)),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    if (response.status === 429) throw rateLimitFromResponse(response, await response.text());
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return this.toReply((await response.json()) as ChatCompletionResponse);
  }

  private headers(): Record<string, string> {
    return { ...this.config.headers, Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private body(request: ChatRequest): Record<string, unknown> {
    const { model, messages, maxTokens, temperature, extraBody, tools, toolChoice } = request;
    return {
      ...extraBody,
      model,
      messages: messages.map((message) => this.toWireMessage(message)),
      max_tokens: maxTokens,
      ...(temperature !== undefined && { temperature }),
      ...(tools?.length && { tools: tools.map((tool) => this.toWireTool(tool)), tool_choice: toolChoice ?? "auto" }),
    };
  }

  private toReply(data: ChatCompletionResponse): AssistantReply {
    const wire = data.choices?.[0]?.message;
    const content = wire?.content?.trim() ?? "";
    const toolCalls = this.toToolCalls(wire?.tool_calls ?? []);
    const providerData = wire?.reasoning_details ? { reasoning_details: wire.reasoning_details } : undefined;
    return { content, toolCalls, message: { role: "assistant", content, toolCalls, providerData } };
  }

  private toToolCalls(calls: WireToolCall[]): ToolCall[] {
    return calls.map(({ id, function: { name, arguments: args } }) => ({ id, name, arguments: args || "{}" }));
  }

  private toWireMessage(message: ChatMessage): Record<string, unknown> {
    if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    return message.role === "assistant" ? this.toWireAssistant(message) : message;
  }

  private toWireAssistant({ content, toolCalls, providerData }: AssistantMessage): Record<string, unknown> {
    const wireCalls = toolCalls?.map(({ id, name, arguments: args }) => ({
      id, type: "function", function: { name, arguments: args },
    }));
    const calls = wireCalls?.length && { tool_calls: wireCalls };
    return { ...providerData, role: "assistant", content: content || null, ...calls };
  }

  private toWireTool({ name, description, parameters }: ToolDefinition) {
    return { type: "function", function: { name, description, parameters } };
  }
}
