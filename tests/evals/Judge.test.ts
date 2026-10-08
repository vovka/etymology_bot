import { describe, expect, it } from "vitest";
import { Judge } from "../../evals/grade/Judge.js";
import type { CaseRun } from "../../evals/run/EvalRunner.js";
import { scripted, text } from "../fixtures.js";

const keyFacts = [{ fact: "From Latin salarium", present: true }];
const verdict = { keyFacts, unsupportedClaims: [], mythsLabelled: null, notes: "ok" };
const evalCase = { id: "salary", query: "salary", language: "English", tags: [], keyFacts: ["From Latin salarium"] };

describe("Judge", () => {
  it("grades with the key facts, material and answer, reading JSON wrapped in prose", async () => {
    const judge = scripted(text(`Here you go:\n\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``));
    const run = { answer: "Salary comes from salarium [1].", material: "[1] Wiktionary: salarium" } as CaseRun;
    expect(await new Judge(judge.provider, "judge").grade(evalCase, run)).toEqual(verdict);
    const prompt = judge.requests[0].messages[0].content;
    expect(prompt).toContain("- From Latin salarium");
    expect(prompt).toContain("[1] Wiktionary: salarium");
    expect(judge.requests[0].temperature).toBeUndefined();
  });

  it("counts a win only when it holds in both orders", async () => {
    const pick = (winner: number) => text(JSON.stringify({ winner, reason: "r" }));
    expect(await new Judge(scripted(pick(1), pick(2)).provider, "j").compare("w", "a", "b")).toBe("a");
    expect(await new Judge(scripted(pick(2), pick(1)).provider, "j").compare("w", "a", "b")).toBe("b");
    expect(await new Judge(scripted(pick(1), pick(1)).provider, "j").compare("w", "a", "b")).toBe("tie");
  });
});
