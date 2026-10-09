import { describe, expect, it } from "vitest";
import { DirectWriter } from "../src/etymology/DirectWriter.js";
import type { Progress } from "../src/etymology/Answer.js";
import { CooldownTracker } from "../src/llm/CooldownTracker.js";
import { ModelChain } from "../src/llm/ModelChain.js";
import type { Provider } from "../src/providers/Provider.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";
import { scripted, seed, text } from "./fixtures.js";

function setup(...providers: Provider[]) {
  const links = providers.map((provider, i) => ({ entry: { provider: "p", model: `m${i}`, extraBody: {} }, provider }));
  const cooldowns = new CooldownTracker(new MemoryStore(), { defaultSeconds: 60, dailyQuotaSeconds: 60 });
  const chain = new ModelChain(links, cooldowns, { requestTimeoutMs: 1000, maxTokens: 100, temperature: 0 });
  const progress: Progress[] = [];
  const write = () => new DirectWriter(chain).write("salary", "English", seed, async (p) => void progress.push(p));
  return { write, progress };
}

describe("DirectWriter", () => {
  it("writes in one call without tools and lists the cited sources", async () => {
    const model = scripted(text("From Latin salarium [1]."));
    const { write, progress } = setup(model.provider);
    const answer = await write();
    const source = { number: 1, name: seed[0].name, url: seed[0].url };
    expect(answer).toEqual({ text: "From Latin salarium [1].", sources: [source] });
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0].tools).toBeUndefined();
    expect(progress).toEqual([{ stage: "writing" }]);
  });

  it("moves to the next model when one returns nothing", async () => {
    const empty = scripted(text(""));
    const backup = scripted(text("Answer [1]."));
    expect((await setup(empty.provider, backup.provider).write()).text).toBe("Answer [1].");
  });
});
