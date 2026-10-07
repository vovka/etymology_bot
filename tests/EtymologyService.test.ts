import { describe, expect, it, vi } from "vitest";
import { EtymologyService } from "../src/etymology/EtymologyService.js";
import type { ModelChain } from "../src/llm/ModelChain.js";
import type { Researcher } from "../src/research/Researcher.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";

function setup() {
  const researcher = { research: vi.fn(async () => [{ name: "Wiktionary", url: "https://w", text: "from Latin" }]) };
  const chain = { complete: vi.fn(async () => "story") };
  const service = new EtymologyService(
    researcher as unknown as Researcher, chain as unknown as ModelChain, new MemoryStore(), { enabled: true, ttlSeconds: 60 },
  );
  return { service, researcher, chain };
}

describe("EtymologyService", () => {
  it("researches, then writes with the sources in the prompt, reporting each stage", async () => {
    const { service, chain } = setup();
    const stages: string[] = [];
    const answer = await service.explain("salary", "English", async (stage) => void stages.push(stage));
    expect(stages).toEqual(["researching", "writing"]);
    expect(answer).toEqual({ text: "story", sources: [{ name: "Wiktionary", url: "https://w" }] });
    expect(JSON.stringify(chain.complete.mock.calls[0])).toContain("[1] Wiktionary (https://w)");
  });

  it("serves repeated questions from the cache", async () => {
    const { service, researcher } = setup();
    await service.explain("salary", "English", async () => {});
    const again = await service.explain("Salary", "English", async () => {});
    expect(researcher.research).toHaveBeenCalledTimes(1);
    expect(again.text).toBe("story");
  });
});
