import { loadPrompt } from "../config/loadPrompt.js";
import type { NumberedSource } from "./agent/SourceRegistry.js";
import type { ChatMessage } from "../providers/Provider.js";

const SYSTEM_PROMPT = loadPrompt("system");
const EXPLORATION_PROMPT = loadPrompt("exploration");
const WEB_RESEARCH_PROMPT = loadPrompt("web-research");

export const WRITE_NOW = loadPrompt("write-now");

/** webResearch adds the open-web instructions: a section of web finds and a longer answer. */
export function buildPrompt(
  query: string, replyLanguage: string, sources: readonly NumberedSource[], canExplore: boolean, webResearch = false,
): ChatMessage[] {
  const exploration = canExplore ? [EXPLORATION_PROMPT] : [];
  const web = webResearch ? [WEB_RESEARCH_PROMPT] : [];
  const system = [SYSTEM_PROMPT, ...exploration, ...web, loadPrompt("reply-language", { language: replyLanguage })];
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
