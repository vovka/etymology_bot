import { describe, expect, it, vi } from "vitest";
import { ExplorationAgent } from "../src/agent/ExplorationAgent.js";
import { ResearchToolbox } from "../src/agent/ResearchToolbox.js";
import { SourceRegistry } from "../src/agent/SourceRegistry.js";
import type { ChainEntry } from "../src/config/AppConfig.js";
import type { Progress } from "../src/etymology/Answer.js";
import { CooldownTracker } from "../src/llm/CooldownTracker.js";
import { ModelChain } from "../src/llm/ModelChain.js";
import type { AssistantReply, ChatRequest, Provider, ToolCall } from "../src/providers/Provider.js";
import type { HttpGet } from "../src/research/Source.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";

const SAL_WIKITEXT = "==Latin==\n===Etymology===\nFrom {{inh|la|itc-pro|*sals}}.\n====Descendants====\n* French: sel";
const seed = [{ name: "Wiktionary", url: "https://en.wiktionary.org/wiki/salary", text: "from Latin salarium" }];
const agentConfig = { maxSteps: 3, maxToolCallsPerStep: 2, timeBudgetMs: 60_000 };

const call = (id: string, name: string, args: object): ToolCall => ({ id, name, arguments: JSON.stringify(args) });
const text = (content: string): AssistantReply => ({ content, toolCalls: [], message: { role: "assistant", content } });
const tools = (...toolCalls: ToolCall[]): AssistantReply =>
  ({ content: "", toolCalls, message: { role: "assistant", content: "", toolCalls } });

const fakeGet: HttpGet = async (url) => {
  if (url.includes("wiktionary") && url.includes("page=sal")) return Response.json({ parse: { wikitext: SAL_WIKITEXT } });
  return Response.json({}, { status: 404 });
};

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

function setup(providers: Provider[], entries: Partial<ChainEntry>[] = [], config = agentConfig) {
  const links = providers.map((provider, i) => ({
    entry: { provider: "p", model: `m${i}`, extraBody: {}, tools: true, ...entries[i] }, provider,
  }));
  const chain = new ModelChain(links, new CooldownTracker(new MemoryStore(), { defaultSeconds: 60, dailyQuotaSeconds: 60 }),
    { requestTimeoutMs: 1000, maxTokens: 100, temperature: 0 });
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
    expect(answer.sources.map((s) => s.number)).toEqual([1, 2]);
    expect(answer.sources[1].url).toBe("https://en.wiktionary.org/wiki/sal");
    const last = model.requests[1].messages.at(-1)!;
    expect(last).toMatchObject({ role: "tool", toolCallId: "c1" });
    expect("content" in last && last.content).toContain("Source [2] Wiktionary");
    expect("content" in last && last.content).toContain("Descendants");
    expect(progress).toContainEqual({ stage: "exploring", detail: "Wiktionary «sal»" });
  });

  it("makes the model write once the step limit is reached", async () => {
    const lookup = tools(call("c", "wiktionary", { term: "sal" }));
    const model = scripted(lookup, lookup, lookup, text("Answer."));
    const { explore, progress } = setup([model.provider]);
    expect((await explore()).text).toBe("Answer.");
    const final = model.requests.at(-1)!;
    expect(final.toolChoice).toBe("none");
    expect(final.messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining("Research time is up") });
    expect(progress.at(-1)).toEqual({ stage: "writing" });
  });

  it("answers every tool call and refuses those over the per-round cap", async () => {
    const calls = ["a", "b", "c"].map((id) => call(id, "etymonline", { term: id }));
    const model = scripted(tools(...calls), text("Done."));
    const { explore } = setup([model.provider]);
    await explore();
    const results = model.requests[1].messages.filter((m) => m.role === "tool");
    expect(results.map((m) => m.toolCallId)).toEqual(["a", "b", "c"]);
    expect(results[2].content).toContain("Skipped");
  });

  it("hands the sources found so far to the next model when one fails midway", async () => {
    const failing = scripted(tools(call("c1", "wiktionary", { term: "sal" })), new Error("timeout"));
    const backup = scripted(text("Backup answer [2]."));
    const { explore } = setup([failing.provider, backup.provider]);
    const answer = await explore();
    expect(answer.text).toBe("Backup answer [2].");
    expect(backup.requests[0].messages[1].content).toContain("[2] Wiktionary (https://en.wiktionary.org/wiki/sal)");
    expect(answer.sources).toHaveLength(1);
  });

  it("lets a model without tool calling write straight from the sources", async () => {
    const model = scripted(text("Plain answer."));
    const { explore, progress } = setup([model.provider], [{ tools: false }]);
    expect((await explore()).text).toBe("Plain answer.");
    expect(model.requests[0].tools).toBeUndefined();
    expect(model.requests[0].messages[0].content).not.toContain("research tools");
    expect(progress).toEqual([{ stage: "writing" }]);
  });

  it("skips exploring when the time budget is already spent", async () => {
    const model = scripted(text("Quick answer."));
    const { explore } = setup([model.provider], [], { ...agentConfig, timeBudgetMs: -1 });
    expect((await explore()).text).toBe("Quick answer.");
    expect(model.requests[0].tools).toBeUndefined();
  });
});

describe("ResearchToolbox", () => {
  const box = (get: HttpGet = fakeGet) => new ResearchToolbox(get, new SourceRegistry(seed), 1000);

  it("describes its tools with JSON schemas", () => {
    const wikipedia = box().definitions.find((d) => d.name === "wikipedia")!;
    expect(wikipedia.parameters).toMatchObject({ type: "object", required: ["title"] });
    expect(wikipedia.parameters).not.toHaveProperty("$schema");
  });

  it("reports bad input as text instead of throwing", async () => {
    expect(await box().run({ id: "1", name: "wiktionary", arguments: "{oops" })).toContain("invalid arguments");
    expect(await box().run({ id: "2", name: "nope", arguments: "{}" })).toContain("unknown tool");
    expect(await box().run(call("3", "wiktionary", { term: "zzz" }))).toBe('Nothing found for "zzz".');
  });

  it("only reads Wikipedia hosts", async () => {
    const get = vi.fn(fakeGet);
    const result = await box(get).run(call("1", "wikipedia", { title: "Salt", language: "evil.com/x" }));
    expect(result).toContain("invalid arguments");
    expect(get).not.toHaveBeenCalled();
  });

  it("reads other language editions and search results", async () => {
    const get: HttpGet = async (url) => url.startsWith("https://de.wikipedia.org/api/")
      ? Response.json({ extract: "Salz ist…", content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Salz" } } })
      : Response.json({ pages: [{ title: "Via Salaria", description: "<b>Roman</b> road" }] });
    const toolbox = box(get);
    expect(await toolbox.run(call("1", "wikipedia", { title: "Salz", language: "de" })))
      .toBe("Source [2] Wikipedia (de) (https://de.wikipedia.org/wiki/Salz)\nSalz ist…");
    expect(await toolbox.run(call("2", "wikipedia_search", { query: "salt road" }))).toBe("- Via Salaria: Roman road");
  });

  it("fetches a repeated lookup once", async () => {
    const get = vi.fn(fakeGet);
    const toolbox = box(get);
    await toolbox.run(call("1", "etymonline", { term: "salt" }));
    await toolbox.run(call("2", "etymonline", { term: "salt" }));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("SourceRegistry", () => {
  it("numbers sources once and finds the cited ones in any citation style", () => {
    const registry = new SourceRegistry(seed);
    registry.add({ name: "B", url: "b", text: "" });
    expect(registry.add({ name: "B again", url: "b", text: "" }).number).toBe(2);
    registry.add({ name: "C", url: "c", text: "" });
    expect(registry.citedIn("x [1, 3]").map((s) => s.number)).toEqual([1, 3]);
    expect(registry.citedIn("no citations")).toHaveLength(3);
  });
});
