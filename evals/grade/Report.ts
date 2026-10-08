import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CaseRun } from "../run/EvalRunner.js";
import type { Checks } from "./checks.js";
import type { Verdict } from "./Judge.js";

export interface ResultRow extends CaseRun {
  checks: Checks;
  verdict?: Verdict;
  judgeError?: string;
}

const HEADER = ["case", "rep", "checks", "key facts", "grounded", "myths labelled", "rounds", "forced", "s", "cost $"];

/** Writes every row to <base>.jsonl as it arrives, and a Markdown summary to <base>.md at the end. */
export class Report {
  private readonly rows: ResultRow[] = [];

  constructor(private readonly basePath: string) {
    mkdirSync(path.dirname(basePath), { recursive: true });
  }

  add(row: ResultRow): void {
    this.rows.push(row);
    appendFileSync(`${this.basePath}.jsonl`, `${JSON.stringify(row)}\n`);
  }

  writeSummary(title: string): string {
    const table = [HEADER, HEADER.map(() => "---"), ...this.rows.map((row) => this.cells(row))];
    const lines = table.map((cells) => `| ${cells.join(" | ")} |`);
    const markdown = `# ${title}\n\n${this.totals().join("\n")}\n\n${lines.join("\n")}\n`;
    writeFileSync(`${this.basePath}.md`, markdown);
    return markdown;
  }

  private cells(row: ResultRow): string[] {
    const checks = Object.values(row.checks).filter((value) => value !== null);
    const passed = `${checks.filter(Boolean).length}/${checks.length}`;
    const run = [String(row.rounds), yesNo(row.forcedWrite), (row.ms / 1000).toFixed(1), row.cost.toFixed(4)];
    return [row.caseId, String(row.rep), passed, ...this.verdictCells(row), ...run];
  }

  private verdictCells({ verdict, judgeError }: ResultRow): string[] {
    if (!verdict) return [judgeError ? "judge failed" : "–", "–", "–"];
    return [percent(recall(verdict)), yesNo(verdict.unsupportedClaims.length === 0), yesNo(verdict.mythsLabelled)];
  }

  private totals(): string[] {
    const n = this.rows.length;
    const judged = this.rows.flatMap((row) => (row.verdict ? [row.verdict] : []));
    const withMyths = judged.filter((verdict) => verdict.mythsLabelled !== null);
    const cost = this.rows.reduce((total, row) => total + row.cost, 0);
    const grounded = judged.filter((verdict) => verdict.unsupportedClaims.length === 0).length;
    return [
      `- Answered: ${this.count((row) => row.answer !== null)}/${n}`,
      `- All checks passed: ${this.count((row) => !Object.values(row.checks).includes(false))}/${n}`,
      `- Key facts present: ${percent(average(judged.map(recall)))} (judged ${judged.length}/${n})`,
      `- No unsupported claims: ${grounded}/${judged.length}`,
      `- Myths labelled: ${withMyths.filter((verdict) => verdict.mythsLabelled).length}/${withMyths.length}`,
      `- Mean rounds: ${average(this.rows.map((row) => row.rounds)).toFixed(1)}, ` +
        `mean time: ${(average(this.rows.map((row) => row.ms)) / 1000).toFixed(1)}s`,
      `- Cost: $${cost.toFixed(4)} total, $${(cost / Math.max(n, 1)).toFixed(4)} per answer (judge not included)`,
    ];
  }

  private count(predicate: (row: ResultRow) => boolean): number {
    return this.rows.filter(predicate).length;
  }
}

function recall(verdict: Verdict): number {
  return verdict.keyFacts.filter((fact) => fact.present).length / Math.max(verdict.keyFacts.length, 1);
}

function average(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function yesNo(value: boolean | null): string {
  return value === null ? "–" : value ? "yes" : "no";
}
