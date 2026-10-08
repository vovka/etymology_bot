import { allChainEntries, type AppConfig, type ChainEntry } from "../../src/config/AppConfig.js";
import { createProvider } from "../../src/providers/createProvider.js";
import type { Provider } from "../../src/providers/Provider.js";
import { requireEnv } from "../../src/utils/requireEnv.js";
import { ClaudeCliProvider } from "./ClaudeCliProvider.js";

/**
 * "openrouter/openai/gpt-oss-120b" → the openrouter client and model "openai/gpt-oss-120b".
 * "claude-cli/sonnet" → `claude -p --model sonnet` on the Claude subscription; text only, so judge use only.
 */
export function resolveModel(label: string, config: AppConfig): { provider: Provider; model: string } {
  const [providerName, ...rest] = label.split("/");
  if (providerName === "claude-cli" && rest.length > 0) {
    return { provider: new ClaudeCliProvider(), model: rest.join("/") };
  }
  const providerConfig = config.providers[providerName];
  if (!providerConfig || rest.length === 0) throw new Error(`Unknown model "${label}"; expected provider/model`);
  const provider = createProvider(providerName, providerConfig, requireEnv(providerConfig.apiKeyEnv));
  return { provider, model: rest.join("/") };
}

/** The chain entry for a label, so the eval runs a model with the same settings as production. */
export function chainEntry(label: string, config: AppConfig): ChainEntry {
  const entries = allChainEntries(config);
  const entry = entries.find((candidate) => `${candidate.provider}/${candidate.model}` === label);
  if (entry) return entry;
  const labels = [...new Set(entries.map((candidate) => `  ${candidate.provider}/${candidate.model}`))];
  throw new Error(`"${label}" is in no tier's modelChain. Choose one of:\n${labels.join("\n")}`);
}
