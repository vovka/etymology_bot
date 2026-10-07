import type { ProviderConfig } from "../config/AppConfig.js";
import type { CompletionRequest, Provider } from "./Provider.js";
import { rateLimitFromResponse } from "./rateLimitFromResponse.js";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/** Works for any API exposing POST {baseUrl}/chat/completions: OpenRouter, Groq, Together, Mistral, etc. */
export class OpenAICompatibleProvider implements Provider {
  constructor(private readonly config: ProviderConfig, private readonly apiKey: string) {}

  async complete(request: CompletionRequest): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.body(request)),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    if (response.status === 429) throw rateLimitFromResponse(response, await response.text());
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return this.extractContent((await response.json()) as ChatCompletionResponse);
  }

  private headers(): Record<string, string> {
    return { ...this.config.headers, Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private body(request: CompletionRequest): Record<string, unknown> {
    const { model, messages, maxTokens, temperature, extraBody } = request;
    return { ...extraBody, model, messages, max_tokens: maxTokens, temperature };
  }

  private extractContent(data: ChatCompletionResponse): string {
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty completion");
    return content;
  }
}
