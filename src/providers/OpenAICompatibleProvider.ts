import type { ProviderConfig } from "../config/AppConfig.js";
import type { AssistantReply, ChatMessage, ChatRequest, Provider, ToolCall } from "./Provider.js";
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
      messages: messages.map(toWireMessage),
      max_tokens: maxTokens,
      ...(temperature !== undefined && { temperature }),
      ...(tools?.length && { tools: tools.map(toWireTool), tool_choice: toolChoice ?? "auto" }),
    };
  }

  private toReply(data: ChatCompletionResponse): AssistantReply {
    const wire = data.choices?.[0]?.message;
    const content = wire?.content?.trim() ?? "";
    const toolCalls: ToolCall[] = (wire?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments || "{}",
    }));
    if (!content && toolCalls.length === 0) throw new Error("Empty completion");
    const providerData = wire?.reasoning_details ? { reasoning_details: wire.reasoning_details } : undefined;
    return { content, toolCalls, message: { role: "assistant", content, toolCalls, providerData } };
  }
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  if (message.role !== "assistant") return message;
  const toolCalls = message.toolCalls?.map(({ id, name, arguments: args }) => ({
    id, type: "function", function: { name, arguments: args },
  }));
  return {
    ...message.providerData,
    role: "assistant",
    content: message.content || null,
    ...(toolCalls?.length && { tool_calls: toolCalls }),
  };
}

function toWireTool({ name, description, parameters }: NonNullable<ChatRequest["tools"]>[number]) {
  return { type: "function", function: { name, description, parameters } };
}
