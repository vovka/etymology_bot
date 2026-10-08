import type { AppConfig } from "../config/AppConfig.js";
import type { Answer, OnProgress } from "../etymology/Answer.js";
import { buildPrompt, WRITE_NOW } from "../etymology/buildPrompt.js";
import type { ChatModel, ModelChain } from "../llm/ModelChain.js";
import type { AssistantReply, ChatMessage, ToolCall } from "../providers/Provider.js";
import type { HttpGet, SourceDocument } from "../research/Source.js";
import { ResearchToolbox } from "./ResearchToolbox.js";
import { SourceRegistry } from "./SourceRegistry.js";

interface Exploration {
  query: string;
  replyLanguage: string;
  registry: SourceRegistry;
  toolbox: ResearchToolbox;
  deadline: number;
  onProgress: OnProgress;
}

/**
 * The agent loop: the model calls research tools for a few rounds, then writes the answer.
 * If a model fails midway, the next one in the chain starts over with every source found so far,
 * so research is never lost. Once the time budget is spent, models write without exploring.
 */
export class ExplorationAgent {
  constructor(
    private readonly chain: ModelChain,
    private readonly get: HttpGet,
    private readonly config: AppConfig["agent"],
    private readonly maxCharsPerSource: number,
  ) {}

  async explore(
    query: string, replyLanguage: string, seed: SourceDocument[], onProgress: OnProgress,
  ): Promise<Answer> {
    const registry = new SourceRegistry(seed);
    const toolbox = new ResearchToolbox(this.get, registry, this.maxCharsPerSource);
    const deadline = Date.now() + this.config.timeBudgetMs;
    const exploration = { query, replyLanguage, registry, toolbox, deadline, onProgress };
    const text = await this.chain.run((model) => this.attempt(model, exploration));
    return { text, sources: registry.citedIn(text).map(({ number, name, url }) => ({ number, name, url })) };
  }

  private async attempt(model: ChatModel, exploration: Exploration): Promise<string> {
    const { query, replyLanguage, registry, toolbox, deadline, onProgress } = exploration;
    const canExplore = model.supportsTools && Date.now() < deadline;
    const messages = buildPrompt(query, replyLanguage, registry.all(), canExplore);
    if (!canExplore) {
      await onProgress({ stage: "writing" });
      return finalText(await model.chat(messages));
    }
    await onProgress({ stage: "exploring" });
    const tools = toolbox.definitions;
    for (let step = 0; step < this.config.maxSteps && Date.now() < deadline; step++) {
      const reply = await model.chat(messages, { tools, toolChoice: "auto" });
      if (reply.toolCalls.length === 0) return finalText(reply);
      messages.push(reply.message);
      const calls = reply.toolCalls.slice(0, this.config.maxToolCallsPerStep);
      await onProgress({ stage: "exploring", detail: calls.map((call) => toolbox.describe(call)).join(", ") });
      messages.push(...(await this.runTools(reply.toolCalls, toolbox)));
    }
    // Tools stay declared so the history with tool calls remains valid; "none" makes the model write.
    messages.push({ role: "user", content: WRITE_NOW });
    await onProgress({ stage: "writing" });
    return finalText(await model.chat(messages, { tools, toolChoice: "none" }));
  }

  /** Every call gets a result, in order, as the APIs require; calls over the per-round cap are refused. */
  private async runTools(calls: ToolCall[], toolbox: ResearchToolbox): Promise<ChatMessage[]> {
    const limit = this.config.maxToolCallsPerStep;
    const results = await Promise.all(calls.map((call, i) =>
      i < limit ? toolbox.run(call) : Promise.resolve(`Skipped: at most ${limit} lookups per round.`)));
    return calls.map((call, i) => ({ role: "tool", toolCallId: call.id, content: results[i] }));
  }
}

function finalText(reply: AssistantReply): string {
  if (!reply.content) throw new Error("The model returned tool calls instead of an answer");
  return reply.content;
}
