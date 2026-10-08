import { describe, expect, it, vi } from "vitest";
import type { ExplorationAgent } from "../src/etymology/agent/ExplorationAgent.js";
import { EtymologyService } from "../src/etymology/EtymologyService.js";
import type { Researcher } from "../src/research/Researcher.js";
import { MemoryStore } from "../src/storage/MemoryStore.js";

const seed = [{ name: "Wiktionary", url: "https://w", text: "from Latin" }];

function setup() {
  const researcher = { research: vi.fn(async () => seed) };
  const answer = { text: "story", sources: [{ number: 1, name: "Wiktionary", url: "https://w" }] };
  const agent = { explore: vi.fn(async () => answer) };
  const cache = { enabled: true, ttlSeconds: 60 };
  const service = new EtymologyService(
    researcher as unknown as Researcher, agent as unknown as ExplorationAgent, new MemoryStore(), cache,
  );
  return { service, researcher, agent };
}

describe("EtymologyService", () => {
  it("researches the word, then hands the sources to the agent", async () => {
    const { service, agent } = setup();
    const stages: string[] = [];
    const answer = await service.explain("salary", "English", async (p) => void stages.push(p.stage));
    expect(stages).toEqual(["researching"]);
    expect(answer.text).toBe("story");
    expect(agent.explore).toHaveBeenCalledWith("salary", "English", seed, expect.any(Function));
  });

  it("serves repeated questions from the cache", async () => {
    const { service, researcher } = setup();
    await service.explain("salary", "English", async () => {});
    const again = await service.explain("Salary", "English", async () => {});
    expect(researcher.research).toHaveBeenCalledTimes(1);
    expect(again.text).toBe("story");
  });
});
