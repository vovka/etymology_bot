import { describe, expect, it, vi } from "vitest";
import { ExplorationAgent } from "../src/etymology/agent/ExplorationAgent.js";
import type { Progress } from "../src/etymology/Answer.js";
import { CooldownTracker } from "../src/llm/CooldownTracker.js";
import { ModelChain } from "../src/llm/ModelChain.js";
import type { AssistantReply, ChatRequest, Provider, ToolCall } from "../src/providers/Provider.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";
import { call, fakeGet, seed } from "./fixtures.js";

const agentConfig = { maxSteps: 3, maxToolCallsPerStep: 2, timeBudgetMs: 60_000 };
const text = (content: string): AssistantReply => ({ content, toolCalls: [], message: { role: "assistant", content } });
const tools = (...toolCalls: ToolCall[]): AssistantReply =>
  ({ content: "", toolCalls, message: { role: "assistant", content: "", toolCalls } });

/** A provider that plays back scripted replies and records every request. */
function scripted(...replies: (AssistantReply | Error)[]) {
  const requests: ChatRequest[] = [];
  const provider: Provider = {
    chat: vi.fn(async (request: ChatRequest) => {
      requests.push(structuredClone(request));
      const next = replies.shift();
      if (!next || next instanceof Error) throw next ?? new Error("script ended");
      return next;
    }),
  };
  return { provider, requests };
}

function setup(providers: Provider[], config = agentConfig) {
  const links = providers.map((provider, i) => ({ entry: { provider: "p", model: `m${i}`, extraBody: {} }, provider }));
  const cooldowns = new CooldownTracker(new MemoryStore(), { defaultSeconds: 60, dailyQuotaSeconds: 60 });
  const chain = new ModelChain(links, cooldowns, { requestTimeoutMs: 1000, maxTokens: 100, temperature: 0 });
  const progress: Progress[] = [];
  const agent = new ExplorationAgent(chain, fakeGet, config, 1000);
  const explore = () => agent.explore("salary", "English", seed, async (p) => void progress.push(p));
  return { explore, progress };
}

describe("ExplorationAgent", () => {
  it("calls tools, feeds results back and returns the answer with the cited sources", async () => {
    const model = scripted(tools(call("c1", "wiktionary", { term: "sal" })), text("Salt [2], salary [1]."));
    const { explore, progress } = setup([model.provider]);
    const answer = await explore();
    expect(answer.text).toBe("Salt [2], salary [1].");
    expect(answer.sources.map((s) => s.url)).toEqual([seed[0].url, "https://en.wiktionary.org/wiki/sal"]);
    const last = model.requests[1].messages.at(-1)!;
    expect(last).toMatchObject({ role: "tool", toolCallId: "c1", content: expect.stringContaining("Source [2]") });
    expect(progress).toContainEqual({ stage: "exploring", detail: "Wiktionary «sal»" });
  });

  it("makes the model write once the step limit is reached", async () => {
    const lookup = tools(call("c", "wiktionary", { term: "sal" }));
    const model = scripted(lookup, lookup, lookup, text("Answer."));
    const { explore, progress } = setup([model.provider]);
    expect((await explore()).text).toBe("Answer.");
    const final = model.requests.at(-1)!;
    expect(final.toolChoice).toBe("none");
    expect(final.messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining("Research time") });
    expect(progress.at(-1)).toEqual({ stage: "writing" });
  });

  it("answers every tool call and refuses those over the per-round cap", async () => {
    const calls = ["a", "b", "c"].map((id) => call(id, "etymonline", { term: id }));
    const model = scripted(tools(...calls), text("Done."));
    await setup([model.provider]).explore();
    const results = model.requests[1].messages.filter((m) => m.role === "tool");
    expect(results.map((m) => m.toolCallId)).toEqual(["a", "b", "c"]);
    expect(results[2].content).toContain("Skipped");
  });

  it("hands the sources found so far to the next model when one fails midway", async () => {
    const failing = scripted(tools(call("c1", "wiktionary", { term: "sal" })), new Error("timeout"));
    const backup = scripted(text("Backup answer [2]."));
    const answer = await setup([failing.provider, backup.provider]).explore();
    expect(answer.text).toBe("Backup answer [2].");
    expect(backup.requests[0].messages[1].content).toContain("[2] Wiktionary (https://en.wiktionary.org/wiki/sal)");
    expect(answer.sources).toHaveLength(1);
  });

  it("writes straight from the sources when the time budget is already spent", async () => {
    const model = scripted(text("Quick answer."));
    const { explore, progress } = setup([model.provider], { ...agentConfig, timeBudgetMs: -1 });
    expect((await explore()).text).toBe("Quick answer.");
    expect(model.requests[0].tools).toBeUndefined();
    expect(model.requests[0].messages[0].content).not.toContain("research tools");
    expect(progress).toEqual([{ stage: "writing" }]);
  });
});
