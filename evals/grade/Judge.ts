import path from "node:path";
import { z } from "zod";
import { loadPrompt } from "../../src/config/loadPrompt.js";
import type { Provider } from "../../src/providers/Provider.js";
import { parseJson } from "../../src/utils/parseJson.js";
import type { EvalCase } from "../run/Cases.js";
import type { CaseRun } from "../run/EvalRunner.js";

/** Stronger than every model in the chain; it must never grade its own answers. */
export const DEFAULT_JUDGE = "openrouter/anthropic/claude-opus-5.5";

const PROMPTS_DIR = path.join(process.cwd(), "evals", "prompts");

const verdictSchema = z.object({
  keyFacts: z.array(z.object({ fact: z.string(), present: z.boolean() })),
  unsupportedClaims: z.array(z.string()),
  mythsLabelled: z.boolean().nullable(),
  notes: z.string(),
});
export type Verdict = z.infer<typeof verdictSchema>;

const preferenceSchema = z.object({ winner: z.union([z.literal(0), z.literal(1), z.literal(2)]), reason: z.string() });

/** A stronger model grading what needs judgment: key facts, grounding, myths, and which answer is better. */
export class Judge {
  constructor(private readonly provider: Provider, private readonly model: string) {}

  grade(evalCase: EvalCase, run: CaseRun): Promise<Verdict> {
    const keyFacts = evalCase.keyFacts.map((fact) => `- ${fact}`).join("\n");
    const values = { word: evalCase.query, language: evalCase.language, keyFacts, material: run.material };
    return this.ask(loadPrompt("grade", { ...values, answer: run.answer ?? "" }, PROMPTS_DIR), verdictSchema);
  }

  /** Asks in both orders and counts a win only if it holds both times, so answer position can't decide. */
  async compare(word: string, a: string, b: string): Promise<"a" | "b" | "tie"> {
    const aFirst = await this.prefer(word, a, b);
    const bFirst = await this.prefer(word, b, a);
    if (aFirst === 1 && bFirst === 2) return "a";
    if (aFirst === 2 && bFirst === 1) return "b";
    return "tie";
  }

  private async prefer(word: string, first: string, second: string): Promise<number> {
    const prompt = loadPrompt("pairwise", { word, first, second }, PROMPTS_DIR);
    return (await this.ask(prompt, preferenceSchema)).winner;
  }

  /** Judges sometimes wrap the JSON in prose or a code fence, so only the outermost object is parsed. */
  private async ask<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    const messages = [{ role: "user" as const, content: prompt }];
    const request = { model: this.model, messages, maxTokens: 8000, timeoutMs: 180_000, extraBody: {} };
    const reply = await this.provider.chat(request);
    const json = reply.content.slice(reply.content.indexOf("{"), reply.content.lastIndexOf("}") + 1);
    return schema.parse(parseJson(json));
  }
}
