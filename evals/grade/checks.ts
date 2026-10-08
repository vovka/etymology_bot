import { citedNumbers } from "../../src/etymology/agent/SourceRegistry.js";
import { parseJson } from "../../src/utils/parseJson.js";
import type { EvalCase } from "../run/Cases.js";
import type { CaseRun } from "../run/EvalRunner.js";

/** Each check passes (true), fails (false) or doesn't apply to the case (null). */
export type Checks = Record<string, boolean | null>;

const OTHER_TAG = /<(?!\/?[bi]>)[^>]*>/i;
const SCRIPTS: Record<string, RegExp> = { English: /\p{Script=Latin}/gu, Ukrainian: /\p{Script=Cyrillic}/gu };

/** Free, deterministic checks that need no judge. */
export function runChecks(run: CaseRun, evalCase: EvalCase): Checks {
  const answerChecks = run.answer === null ? {} : checkAnswer(run.answer, run, evalCase.language);
  return { answered: run.answer !== null, ...answerChecks, ...checkExploration(run, evalCase) };
}

function checkAnswer(answer: string, run: CaseRun, language: string): Checks {
  const words = answer.split(/\s+/).filter(Boolean).length;
  return {
    citationsValid: citedNumbers(answer).every((n) => run.sources.some((source) => source.number === n)),
    telegramTags: !OTHER_TAG.test(answer),
    length: words >= 200 && words <= 550,
    language: SCRIPTS[language] ? writtenIn(answer, SCRIPTS[language]) : null,
  };
}

function checkExploration(run: CaseRun, evalCase: EvalCase): Checks {
  const lookups = run.toolCalls.map((call) => `${call.name}:${normalize(call.arguments)}`);
  const terms = evalCase.expectLookups?.map((term) => term.toLowerCase());
  return {
    explored: run.toolCalls.some((call) => call.result.startsWith("Source [")),
    expectedLookup: terms ? lookups.some((lookup) => terms.some((term) => lookup.includes(term))) : null,
    validToolCalls: run.toolCalls.every((call) => !call.result.startsWith("Error:")),
    noRepeatedLookups: new Set(lookups).size === lookups.length,
  };
}

/** Most letters are in the expected script; quoted foreign forms don't outweigh the prose. */
function writtenIn(text: string, script: RegExp): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return (text.match(script)?.length ?? 0) > letters / 2;
}

/** Same JSON in any spacing or escaping compares equal; lowercased for term matching. */
function normalize(args: string): string {
  return (JSON.stringify(parseJson(args)) ?? args).toLowerCase();
}
