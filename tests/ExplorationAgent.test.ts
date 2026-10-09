import { describe, expect, it } from "vitest";
import { ExplorationAgent } from "../src/etymology/agent/ExplorationAgent.js";
import type { ChainEntry } from "../src/config/AppConfig.js";
import type { Progress } from "../src/etymology/Answer.js";
import { CooldownTracker } from "../src/llm/CooldownTracker.js";
import { ModelChain } from "../src/llm/ModelChain.js";
import type { Provider } from "../src/providers/Provider.js";
import type { TavilyClient } from "../src/research/TavilyClient.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";
import { call, fakeGet, fakeWeb, scripted, seed, text, tools } from "./fixtures.js";

const agentConfig = { maxSteps: 3, maxToolCallsPerStep: 2, timeBudgetMs: 60_000 };
function setup(providers: Provider[], config = agentConfig, overrides: Partial<ChainEntry> = {}, web?: TavilyClient) {
  const links = providers.map((provider, i) =>
    ({ entry: { provider: "p", model: `m${i}`, extraBody: {}, ...overrides }, provider }));
  const cooldowns = new CooldownTracker(new MemoryStore(), { defaultSeconds: 60, dailyQuotaSeconds: 60 });
  const chain = new ModelChain(links, cooldowns, { requestTimeoutMs: 1000, maxTokens: 100, temperature: 0 });
  const progress: Progress[] = [];
  const agent = new ExplorationAgent(chain, fakeGet, config, 1000, web);
  const explore = () => agent.write("salary", "English", seed, async (p) => void progress.push(p));
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

  it("uses the chain entry's maxSteps instead of the default", async () => {
    const lookup = tools(call("c", "wiktionary", { term: "sal" }));
    const model = scripted(lookup, text("Answer."));
    expect((await setup([model.provider], agentConfig, { maxSteps: 1 }).explore()).text).toBe("Answer.");
    expect(model.requests.at(-1)!.toolChoice).toBe("none");
  });

  it("asks the same model to write when it ends a round with neither text nor tool calls", async () => {
    const model = scripted(tools(call("c", "wikipedia_search", { query: "x" })), text(""), text("Answer."));
    expect((await setup([model.provider]).explore()).text).toBe("Answer.");
    expect(model.requests.at(-1)!.toolChoice).toBe("none");
  });

  it("answers every tool call and refuses those over the per-round cap", async () => {
    const calls = ["a", "b", "c"].map((id) => call(id, "etymonline", { term: id }));
    const model = scripted(tools(...calls), text("Done."));
    await setup([model.provider]).explore();
    const results = model.requests[1].messages.filter((m) => m.role === "tool");
    expect(results.map((m) => m.toolCallId)).toEqual(["a", "b", "c"]);
    expect(results[2].content).toContain("Skipped");
  });

  it("explores with no step or per-round limits when they are Infinity, ignoring the entry's maxSteps", async () => {
    const calls = ["a", "b", "c"].map((id) => call(id, "etymonline", { term: id }));
    const model = scripted(tools(...calls), tools(...calls), tools(...calls), text("Deep answer."));
    const unlimited = { maxSteps: Infinity, maxToolCallsPerStep: Infinity, timeBudgetMs: 60_000 };
    expect((await setup([model.provider], unlimited, { maxSteps: 1 }).explore()).text).toBe("Deep answer.");
    expect(model.requests).toHaveLength(4);
    const results = model.requests[3].messages.filter((m) => m.role === "tool");
    expect(results.some((m) => m.content.includes("Skipped"))).toBe(false);
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

  it("with web search, sends an answer citing no web source back once to search the web", async () => {
    const search = tools(call("w", "web_search", { query: "salary salt" }));
    const model = scripted(text("Latin [1]."), search, text("Latin [1], salt pay [2]."));
    const answer = await setup([model.provider], agentConfig, {}, fakeWeb).explore();
    expect(answer.text).toBe("Latin [1], salt pay [2].");
    expect(answer.sources.map((s) => s.name)).toEqual(["Wiktionary", "saltblog.com"]);
    expect(model.requests[0].messages[0].content).toContain("Beyond the dictionaries");
    expect(model.requests[0].tools?.map((t) => t.name)).toContain("web_search");
    const nudge = model.requests[1].messages.at(-1);
    expect(nudge).toMatchObject({ role: "user", content: expect.stringContaining("open web") });
  });

  it("sends the answer back at most once, and not when it already cites the web", async () => {
    const stubborn = scripted(text("Latin [1]."), text("Still Latin [1]."));
    expect((await setup([stubborn.provider], agentConfig, {}, fakeWeb).explore()).text).toBe("Still Latin [1].");
    const search = tools(call("w", "web_search", { query: "salary" }));
    const cited = scripted(search, text("Salt pay [2]."));
    expect((await setup([cited.provider], agentConfig, {}, fakeWeb).explore()).text).toBe("Salt pay [2].");
    expect(cited.requests).toHaveLength(2);
  });
});
