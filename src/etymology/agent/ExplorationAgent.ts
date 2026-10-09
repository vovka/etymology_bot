import type { AppConfig } from "../../config/AppConfig.js";
import { loadPrompt } from "../../config/loadPrompt.js";
import type { ChatModel, ChatOptions, ModelChain } from "../../llm/ModelChain.js";
import type { AssistantReply, ChatMessage, ToolCall } from "../../providers/Provider.js";
import type { HttpGet, SourceDocument } from "../../research/Source.js";
import type { TavilyClient } from "../../research/TavilyClient.js";
import type { Answer, OnProgress } from "../Answer.js";
import { buildPrompt, WRITE_NOW } from "../buildPrompt.js";
import type { Writer } from "../Writer.js";
import { ResearchToolbox } from "./ResearchToolbox.js";
import { SourceRegistry } from "./SourceRegistry.js";

/** Infinity removes a limit. */
export type AgentLimits = Pick<AppConfig["agent"], "maxSteps" | "maxToolCallsPerStep" | "timeBudgetMs">;

const WEB_NUDGE = loadPrompt("web-nudge");

interface Exploration {
  query: string;
  replyLanguage: string;
  registry: SourceRegistry;
  toolbox: ResearchToolbox;
  deadline: number;
  onProgress: OnProgress;
  // Set once the model was sent back to search the web, so that happens at most once.
  nudged: boolean;
}

/**
 * The agent loop: the model calls research tools for a few rounds, then writes the answer.
 * If a model fails midway, the next one in the chain starts over with every source found so far,
 * so research is never lost. Once the time budget is spent, models write without exploring.
 */
export class ExplorationAgent implements Writer {
  constructor(
    private readonly chain: ModelChain,
    private readonly get: HttpGet,
    private readonly config: AgentLimits,
    private readonly maxCharsPerSource: number,
    // Adds web search: the answer must then cite a web source, or the model is sent back once to find one.
    private readonly web?: TavilyClient,
  ) {}

  async write(query: string, replyLanguage: string, seed: SourceDocument[], onProgress: OnProgress): Promise<Answer> {
    const registry = new SourceRegistry(seed);
    const toolbox = new ResearchToolbox(this.get, registry, this.maxCharsPerSource, this.web);
    const deadline = Date.now() + this.config.timeBudgetMs;
    const exploration = { query, replyLanguage, registry, toolbox, deadline, onProgress, nudged: false };
    const text = await this.chain.run((model) => this.attempt(model, exploration));
    return { text, sources: registry.citedIn(text).map(({ number, name, url }) => ({ number, name, url })) };
  }

  private attempt(model: ChatModel, exploration: Exploration): Promise<string> {
    const canExplore = Date.now() < exploration.deadline;
    const { query, replyLanguage, registry } = exploration;
    const messages = buildPrompt(query, replyLanguage, registry.all(), canExplore, this.web !== undefined);
    if (!canExplore) return this.writeAnswer(model, messages, exploration.onProgress);
    return this.exploreThenWrite(model, messages, exploration);
  }

  private async exploreThenWrite(model: ChatModel, messages: ChatMessage[], exploration: Exploration) {
    await exploration.onProgress({ stage: "exploring" });
    const tools = exploration.toolbox.definitions;
    // A per-model step limit only replaces a finite one: an unlimited agent has none.
    const maxSteps = Number.isFinite(this.config.maxSteps) ? (model.maxSteps ?? this.config.maxSteps) : Infinity;
    for (let step = 0; step < maxSteps && Date.now() < exploration.deadline; step++) {
      const reply = await model.chat(messages, { tools, toolChoice: "auto" });
      if (reply.toolCalls.length === 0 && reply.content) {
        if (!this.needsWebNudge(reply.content, exploration)) return reply.content;
        messages.push(reply.message, { role: "user", content: WEB_NUDGE });
        continue;
      }
      // gpt-oss sometimes ends a round with neither text nor tool calls; asking it to write gets an answer.
      if (reply.toolCalls.length === 0) break;
      await this.runRound(reply, messages, exploration);
    }
    // Tools stay declared so the history with tool calls remains valid; "none" makes the model write.
    messages.push({ role: "user", content: WRITE_NOW });
    return this.writeAnswer(model, messages, exploration.onProgress, { tools, toolChoice: "none" });
  }

  private needsWebNudge(answer: string, exploration: Exploration): boolean {
    if (!this.web || exploration.nudged || exploration.toolbox.citesWebSource(answer)) return false;
    exploration.nudged = true;
    return true;
  }

  private async runRound(reply: AssistantReply, messages: ChatMessage[], { toolbox, onProgress }: Exploration) {
    messages.push(reply.message);
    const calls = reply.toolCalls.slice(0, this.config.maxToolCallsPerStep);
    await onProgress({ stage: "exploring", detail: calls.map((call) => toolbox.describe(call)).join(", ") });
    messages.push(...(await this.runTools(reply.toolCalls, toolbox)));
  }

  /** Every call gets a result, in order, as the APIs require; calls over the per-round cap are refused. */
  private async runTools(calls: ToolCall[], toolbox: ResearchToolbox): Promise<ChatMessage[]> {
    const limit = this.config.maxToolCallsPerStep;
    const results = await Promise.all(calls.map((call, i) =>
      i < limit ? toolbox.run(call) : Promise.resolve(`Skipped: at most ${limit} lookups per round.`)));
    return calls.map((call, i) => ({ role: "tool", toolCallId: call.id, content: results[i] }));
  }

  private async writeAnswer(model: ChatModel, messages: ChatMessage[], onProgress: OnProgress, options?: ChatOptions) {
    await onProgress({ stage: "writing" });
    return this.finalText(await model.chat(messages, options));
  }

  private finalText(reply: AssistantReply): string {
    if (!reply.content) throw new Error("Empty completion");
    return reply.content;
  }
}
