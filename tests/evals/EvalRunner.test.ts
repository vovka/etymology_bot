import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/loadConfig.js";
import { EvalRunner } from "../../evals/run/EvalRunner.js";
import { call, fakeGet, scripted, text, tools } from "../fixtures.js";

const config = loadConfig();
const entry = { provider: "p", model: "m", extraBody: {} };
const evalCase = { id: "salary", query: "salary", language: "English", tags: [], keyFacts: ["x"] };

describe("EvalRunner", () => {
  it("records the answer, the tool calls with their results, and usage", async () => {
    const final = { ...text("Salt [1]."), usage: { inputTokens: 100, outputTokens: 20, cost: 0.001 } };
    const model = scripted(tools(call("c1", "wiktionary", { term: "sal" })), final);
    const run = await new EvalRunner(config, entry, model.provider, fakeGet).run(evalCase, 0);
    expect(run).toMatchObject({ caseId: "salary", query: "salary", model: "p/m", answer: "Salt [1].", error: null });
    expect(run).toMatchObject({ modelCalls: 2, rounds: 1, forcedWrite: false, cost: 0.001, outputTokens: 20 });
    const lookup = { name: "wiktionary", result: expect.stringMatching(/^Source \[1\]/) };
    expect(run.toolCalls).toEqual([expect.objectContaining(lookup)]);
    expect(run.material).toContain("From {{inh|la|itc-pro|*sals}}");
  });

  it("records the model's error instead of throwing", async () => {
    const model = scripted(new Error("HTTP 400: bad request"));
    const run = await new EvalRunner(config, entry, model.provider, fakeGet).run(evalCase, 0);
    expect(run).toMatchObject({ answer: null, error: "Error: HTTP 400: bad request" });
  });
});
