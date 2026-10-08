import { describe, expect, it } from "vitest";
import { runChecks } from "../../evals/grade/checks.js";
import { loadCases } from "../../evals/run/Cases.js";
import type { CaseRun } from "../../evals/run/EvalRunner.js";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const evalCase = {
  id: "salary", query: "salary", language: "English", tags: [], keyFacts: ["x"], expectLookups: ["salarium"],
};
const lookup = (term: string, result: string) => ({ name: "wiktionary", arguments: JSON.stringify({ term }), result });

function run(overrides: Partial<CaseRun>): CaseRun {
  return {
    caseId: "salary", query: "salary", rep: 0, model: "p/m", answer: `<b>Salary</b> [1] ${words(250)}`, error: null,
    sources: [{ number: 1, name: "W", url: "u" }], ms: 1, modelCalls: 2, rounds: 1, forcedWrite: false,
    toolCalls: [lookup("Salarium", "Source [2] Wiktionary")], material: "", inputTokens: 0, outputTokens: 0, cost: 0,
    ...overrides,
  };
}

describe("runChecks", () => {
  it("passes a good run", () => {
    expect(Object.values(runChecks(run({}), evalCase)).every((value) => value === true)).toBe(true);
  });

  it("catches bad citations, tags, length, language and lookups", () => {
    const checks = runChecks(run({
      answer: "<a href='x'>Зарплата</a> [3] слово слово",
      toolCalls: [lookup("sal", "Error: invalid arguments"), lookup("sal", "Error: invalid arguments")],
    }), evalCase);
    expect(checks).toEqual({
      answered: true, citationsValid: false, telegramTags: false, length: false, language: false,
      explored: false, expectedLookup: false, validToolCalls: false, noRepeatedLookups: false,
    });
  });

  it("skips answer checks when there is no answer, and lookups the case doesn't expect", () => {
    const checks = runChecks(run({ answer: null }), { ...evalCase, expectLookups: undefined });
    expect(checks.answered).toBe(false);
    expect(checks).not.toHaveProperty("length");
    expect(checks.expectedLookup).toBeNull();
  });

  it("loads the shipped cases", () => {
    expect(loadCases().length).toBeGreaterThanOrEqual(30);
  });
});
