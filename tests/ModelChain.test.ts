import { describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "../src/config/AppConfig.js";
import { CooldownTracker } from "../src/llm/CooldownTracker.js";
import { AllModelsUnavailableError, ModelChain } from "../src/llm/ModelChain.js";
import { RateLimitError, type Provider } from "../src/providers/Provider.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";

const llm = { requestTimeoutMs: 1000, maxTokens: 100, temperature: 0 };
const cooldown = { defaultSeconds: 60, dailyQuotaSeconds: 3600 };
const entry = (model: string): ChainEntry => ({ provider: "p", model, extraBody: {} });
const provider = (impl: () => Promise<string>): Provider => ({ complete: vi.fn(impl) });

function setup(...providers: Provider[]) {
  const store = new MemoryStore();
  const links = providers.map((p, i) => ({ entry: entry(`m${i}`), provider: p }));
  return { store, chain: new ModelChain(links, new CooldownTracker(store, cooldown), llm) };
}

describe("ModelChain", () => {
  it("returns the first model's answer", async () => {
    const second = provider(async () => "second");
    const { chain } = setup(provider(async () => "first"), second);
    expect(await chain.complete([])).toBe("first");
    expect(second.complete).not.toHaveBeenCalled();
  });

  it("falls through to the next model when one is rate-limited and skips it afterwards", async () => {
    const limited = provider(async () => { throw new RateLimitError("429"); });
    const { chain, store } = setup(limited, provider(async () => "backup"));
    expect(await chain.complete([])).toBe("backup");
    expect(await store.get("cooldown:p:m0")).not.toBeNull();
    await chain.complete([]);
    expect(limited.complete).toHaveBeenCalledTimes(1);
  });

  it("falls through on other errors without a cooldown", async () => {
    const { chain, store } = setup(provider(async () => { throw new Error("500"); }), provider(async () => "ok"));
    expect(await chain.complete([])).toBe("ok");
    expect(await store.get("cooldown:p:m0")).toBeNull();
  });

  it("throws when every model fails", async () => {
    const { chain } = setup(provider(async () => { throw new RateLimitError("429"); }));
    await expect(chain.complete([])).rejects.toBeInstanceOf(AllModelsUnavailableError);
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
