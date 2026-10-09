import { describe, expect, it, vi } from "vitest";
import { EtymologyService } from "../src/etymology/EtymologyService.js";
import type { Writer } from "../src/etymology/Writer.js";
import type { Researcher } from "../src/research/Researcher.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";

const seed = [{ name: "Wiktionary", url: "https://w", text: "from Latin" }];

function setup(store = new MemoryStore(), scope = "free") {
  const researcher = { research: vi.fn(async () => seed) };
  const answer = { text: "story", sources: [{ number: 1, name: "Wiktionary", url: "https://w" }] };
  const writer: Writer = { write: vi.fn(async () => answer) };
  const cache = { enabled: true, ttlSeconds: 60 };
  const service = new EtymologyService(researcher as unknown as Researcher, writer, store, cache, scope);
  return { service, researcher, writer };
}

describe("EtymologyService", () => {
  it("researches the word, then hands the sources to the writer", async () => {
    const { service, writer } = setup();
    const stages: string[] = [];
    const answer = await service.explain("salary", "English", async (p) => void stages.push(p.stage));
    expect(stages).toEqual(["researching"]);
    expect(answer.text).toBe("story");
    expect(writer.write).toHaveBeenCalledWith("salary", "English", seed, expect.any(Function));
  });

  it("serves repeated questions from the cache", async () => {
    const { service, researcher } = setup();
    await service.explain("salary", "English", async () => {});
    const again = await service.explain("Salary", "English", async () => {});
    expect(researcher.research).toHaveBeenCalledTimes(1);
    expect(again.text).toBe("story");
  });

  it("keeps each tier's answers apart in the cache", async () => {
    const store = new MemoryStore();
    await setup(store, "free").service.explain("salary", "English", async () => {});
    const pro = setup(store, "pro");
    await pro.service.explain("salary", "English", async () => {});
    expect(pro.researcher.research).toHaveBeenCalledTimes(1);
  });
});
