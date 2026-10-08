import { describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "../src/config/AppConfig.js";
import { CooldownTracker } from "../src/llm/CooldownTracker.js";
import { AllModelsUnavailableError, ModelChain } from "../src/llm/ModelChain.js";
import { RateLimitError, type AssistantReply, type ChatRequest, type Provider } from "../src/providers/Provider.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";

const llm = { requestTimeoutMs: 1000, maxTokens: 100, temperature: 0.3 };
const cooldown = { defaultSeconds: 60, dailyQuotaSeconds: 3600 };
const entry = (model: string, extra: Partial<ChainEntry> = {}): ChainEntry =>
  ({ provider: "p", model, extraBody: {}, tools: true, ...extra });
const reply = (content: string): AssistantReply => ({ content, toolCalls: [], message: { role: "assistant", content } });
const provider = (impl: () => Promise<string>): Provider => ({ chat: vi.fn(async () => reply(await impl())) });
const complete = (chain: ModelChain) => chain.run(async (model) => (await model.chat([])).content);

function setup(...providers: Provider[]) {
  const store = new MemoryStore();
  const links = providers.map((p, i) => ({ entry: entry(`m${i}`), provider: p }));
  return { store, chain: new ModelChain(links, new CooldownTracker(store, cooldown), llm) };
}

describe("ModelChain", () => {
  it("returns the first model's answer", async () => {
    const second = provider(async () => "second");
    const { chain } = setup(provider(async () => "first"), second);
    expect(await complete(chain)).toBe("first");
    expect(second.chat).not.toHaveBeenCalled();
  });

  it("falls through to the next model when one is rate-limited and skips it afterwards", async () => {
    const limited = provider(async () => { throw new RateLimitError("429"); });
    const { chain, store } = setup(limited, provider(async () => "backup"));
    expect(await complete(chain)).toBe("backup");
    expect(await store.get("cooldown:p:m0")).not.toBeNull();
    await complete(chain);
    expect(limited.chat).toHaveBeenCalledTimes(1);
  });

  it("falls through on other errors without a cooldown", async () => {
    const { chain, store } = setup(provider(async () => { throw new Error("500"); }), provider(async () => "ok"));
    expect(await complete(chain)).toBe("ok");
    expect(await store.get("cooldown:p:m0")).toBeNull();
  });

  it("restarts a multi-call task on the next model when a later call fails", async () => {
    let calls = 0;
    const flaky = provider(async () => { if (++calls === 2) throw new Error("timeout"); return "step"; });
    const { chain } = setup(flaky, provider(async () => "done"));
    const result = await chain.run(async (model) => {
      await model.chat([]);
      return `${model.label}:${(await model.chat([])).content}`;
    });
    expect(result).toBe("p/m1:done");
  });

  it("throws when every model fails", async () => {
    const { chain } = setup(provider(async () => { throw new RateLimitError("429"); }));
    await expect(complete(chain)).rejects.toBeInstanceOf(AllModelsUnavailableError);
  });

  it("applies the entry's temperature override, and null leaves it out", async () => {
    const requests: ChatRequest[] = [];
    const recording: Provider = { chat: async (request) => (requests.push(request), reply("x")) };
    const links = [entry("a"), entry("b", { temperature: null }), entry("c", { temperature: 1 })]
      .map((e) => ({ entry: e, provider: recording }));
    const chain = new ModelChain(links, new CooldownTracker(new MemoryStore(), cooldown), llm);
    await chain.run(async (model) => { await model.chat([]); throw new Error("next"); }).catch(() => undefined);
    expect(requests.map((r) => r.temperature)).toEqual([0.3, undefined, 1]);
  });
});

describe("CooldownTracker", () => {
  it("prefers Retry-After, then daily quota, then the entry override, then the default", async () => {
    const tracker = new CooldownTracker(new MemoryStore(), cooldown);
    const custom = { ...entry("x"), cooldownSeconds: 10 };
    expect(await tracker.coolDown(custom, new RateLimitError("", 5, true))).toBe(5);
    expect(await tracker.coolDown(custom, new RateLimitError("", undefined, true))).toBe(3600);
    expect(await tracker.coolDown(custom, new RateLimitError(""))).toBe(10);
    expect(await tracker.coolDown(entry("y"), new RateLimitError(""))).toBe(60);
  });
});
