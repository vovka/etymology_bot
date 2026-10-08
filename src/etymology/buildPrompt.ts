import { loadPrompt } from "../config/loadPrompt.js";
import type { NumberedSource } from "./agent/SourceRegistry.js";
import type { ChatMessage } from "../providers/Provider.js";

const SYSTEM_PROMPT = loadPrompt("system");
const EXPLORATION_PROMPT = loadPrompt("exploration");

export const WRITE_NOW = loadPrompt("write-now");

export function buildPrompt(
  query: string, replyLanguage: string, sources: readonly NumberedSource[], canExplore: boolean,
): ChatMessage[] {
  const exploration = canExplore ? [EXPLORATION_PROMPT] : [];
  const system = [SYSTEM_PROMPT, ...exploration, loadPrompt("reply-language", { language: replyLanguage })];
  return [
    { role: "system", content: system.join("\n") },
    { role: "user", content: `Word: ${query}\n\n${formatSources(sources, canExplore)}` },
  ];
}

function formatSources(sources: readonly NumberedSource[], canExplore: boolean): string {
  if (sources.length === 0) return loadPrompt(canExplore ? "no-sources-explore" : "no-sources");
  const entries = sources.map((source) => `[${source.number}] ${source.name} (${source.url})\n${source.text}`);
  return `SOURCES:\n\n${entries.join("\n\n")}`;
}
