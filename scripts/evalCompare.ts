// Asks the judge which of two eval runs wrote the more interesting answer for each case. See evals/README.md.
// npm run eval:compare -- evals/results/<a>.jsonl evals/results/<b>.jsonl [--judge <model>]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadConfig } from "../src/config/loadConfig.js";
import { DEFAULT_JUDGE, Judge } from "../evals/grade/Judge.js";
import type { ResultRow } from "../evals/grade/Report.js";
import { resolveModel } from "../evals/run/resolveModel.js";

const { values: args, positionals } = parseArgs({
  options: { judge: { type: "string", default: DEFAULT_JUDGE } },
  allowPositionals: true,
});
const [fileA, fileB] = positionals;
if (!fileB) throw new Error("Pass two result files: evals/results/<a>.jsonl evals/results/<b>.jsonl");

const [runA, runB] = [readAnswers(fileA), readAnswers(fileB)];
if ([runA, runB].some((run) => [...run.values()].some((row) => row.model === args.judge))) {
  throw new Error("The judge must not compare its own answers");
}
const { provider, model } = resolveModel(args.judge, loadConfig());
const judge = new Judge(provider, model);
const tally = { a: 0, b: 0, tie: 0 };

for (const [caseId, a] of runA) {
  const b = runB.get(caseId);
  if (!b) continue;
  const winner = await judge.compare(a.query, a.answer!, b.answer!);
  tally[winner]++;
  console.log(`${caseId}: ${winner === "tie" ? "tie" : `${winner.toUpperCase()} wins`}`);
}
console.log(`\nA = ${fileA}\nB = ${fileB}\nA wins ${tally.a}, B wins ${tally.b}, ties ${tally.tie}`);

/** The first answered repetition of each case. */
function readAnswers(file: string): Map<string, ResultRow> {
  const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as ResultRow);
  const answered = rows.filter((row) => row.answer !== null);
  return new Map(answered.reverse().map((row) => [row.caseId, row]));
}
