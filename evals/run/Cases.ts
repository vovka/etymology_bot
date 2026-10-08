import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const caseSchema = z.object({
  id: z.string(),
  query: z.string(),
  language: z.string(),
  tags: z.array(z.string()).default([]),
  keyFacts: z.array(z.string()).min(1),
  expectLookups: z.array(z.string()).optional(),
});

export type EvalCase = z.infer<typeof caseSchema>;

export function loadCases(filePath = "evals/cases.yaml"): EvalCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(filePath, "utf8")));
}
