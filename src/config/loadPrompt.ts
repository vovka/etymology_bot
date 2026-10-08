import { readFileSync } from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.join(process.cwd(), "config", "prompts");

/** Reads a Markdown prompt and fills its {{placeholders}}, so prompts can be edited without touching code. */
export function loadPrompt(name: string, values: Record<string, string> = {}, dir = PROMPTS_DIR): string {
  const template = readFileSync(path.join(dir, `${name}.md`), "utf8").trim();
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}
