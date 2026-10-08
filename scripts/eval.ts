// Runs the eval cases on one model and writes evals/results/<time>-<model>.{jsonl,md}. See evals/README.md.
// npm run eval -- --model openrouter/openai/gpt-oss-120b [--reps 2] [--only salary,posh] [--judge <model> | --no-judge]
import { parseArgs } from "node:util";
import { loadConfig } from "../src/config/loadConfig.js";
import { createHttpGet } from "../src/research/createSources.js";
import { runChecks } from "../evals/grade/checks.js";
import { DEFAULT_JUDGE, Judge } from "../evals/grade/Judge.js";
import { Report, type ResultRow } from "../evals/grade/Report.js";
import { loadCases, type EvalCase } from "../evals/run/Cases.js";
import { EvalRunner, type CaseRun } from "../evals/run/EvalRunner.js";
import { ReplayHttp } from "../evals/run/ReplayHttp.js";
import { chainEntry, resolveModel } from "../evals/run/resolveModel.js";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    judge: { type: "string", default: DEFAULT_JUDGE },
    "no-judge": { type: "boolean", default: false },
    reps: { type: "string", default: "1" },
    only: { type: "string" },
  },
});
const model = args.model;
if (!model) throw new Error("Pass --model provider/model, e.g. --model openrouter/openai/gpt-oss-120b");
if (model === args.judge && !args["no-judge"]) throw new Error("The judge must not grade its own answers");

const config = loadConfig();
const http = new ReplayHttp(createHttpGet(config.research), "evals/fixtures/http.json");
const runner = new EvalRunner(config, chainEntry(model, config), resolveModel(model, config).provider, http.get);
const judge = args["no-judge"] ? null : createJudge(args.judge);
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const report = new Report(`evals/results/${stamp}-${model.replace(/[^\w.-]+/g, "_")}`);

for (const evalCase of selectedCases()) {
  for (let rep = 0; rep < Number(args.reps); rep++) {
    const run = await runner.run(evalCase, rep);
    http.save();
    const row = await grade(run, evalCase);
    report.add(row);
    console.log(`${evalCase.id} #${rep}: ${run.error ?? `${run.rounds} rounds, ${(run.ms / 1000).toFixed(1)}s`}`);
  }
}
console.log(report.writeSummary(`Eval: ${model}`));

function createJudge(label: string): Judge {
  const { provider, model: judgeModel } = resolveModel(label, config);
  return new Judge(provider, judgeModel);
}

function selectedCases(): EvalCase[] {
  const only = args.only?.split(",");
  return loadCases().filter((evalCase) => !only || only.includes(evalCase.id));
}

async function grade(run: CaseRun, evalCase: EvalCase): Promise<ResultRow> {
  const row: ResultRow = { ...run, checks: runChecks(run, evalCase) };
  if (!judge || run.answer === null) return row;
  try {
    return { ...row, verdict: await judge.grade(evalCase, run) };
  } catch (error) {
    return { ...row, judgeError: String(error) };
  }
}
