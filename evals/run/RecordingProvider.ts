import type { AssistantReply, ChatMessage, ChatRequest, Provider } from "../../src/providers/Provider.js";

export interface Trace {
  modelCalls: number;
  rounds: number;
  /** The model hit its round or time limit and was told to write. */
  forcedWrite: boolean;
  toolCalls: { name: string; arguments: string; result: string }[];
  /** Everything the model was given to read: the initial sources and every tool result. */
  material: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/** Wraps a provider and keeps every request and reply, which it then turns into a trace of the run. */
export class RecordingProvider implements Provider {
  readonly errors: string[] = [];
  private readonly requests: ChatRequest[] = [];
  private readonly replies: AssistantReply[] = [];

  constructor(private readonly inner: Provider) {}

  async chat(request: ChatRequest): Promise<AssistantReply> {
    this.requests.push(structuredClone(request));
    try {
      const reply = await this.inner.chat(request);
      this.replies.push(reply);
      return reply;
    } catch (error) {
      this.errors.push(String(error));
      throw error;
    }
  }

  /** The last request carries the whole conversation, since the agent only ever appends to it. */
  trace(): Trace {
    const messages = this.requests.at(-1)?.messages ?? [];
    const results = new Map(messages.flatMap((m) => (m.role === "tool" ? [[m.toolCallId, m.content] as const] : [])));
    return {
      modelCalls: this.requests.length,
      rounds: this.toolRounds(messages).length,
      forcedWrite: this.requests.at(-1)?.toolChoice === "none",
      toolCalls: this.toolRounds(messages).flatMap((m) => (m.toolCalls ?? []).map(({ id, name, arguments: args }) =>
        ({ name, arguments: args, result: results.get(id) ?? "" }))),
      material: [messages.find((m) => m.role === "user")?.content ?? "", ...results.values()].join("\n\n"),
      ...this.usage(),
    };
  }

  private toolRounds(messages: ChatMessage[]) {
    return messages.flatMap((m) => (m.role === "assistant" && m.toolCalls?.length ? [m] : []));
  }

  private usage() {
    const sum = (pick: (r: AssistantReply) => number | undefined) =>
      this.replies.reduce((total, reply) => total + (pick(reply) ?? 0), 0);
    return { inputTokens: sum((r) => r.usage?.inputTokens), outputTokens: sum((r) => r.usage?.outputTokens),
      cost: sum((r) => r.usage?.cost) };
  }
}
