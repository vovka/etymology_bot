import type { ProviderConfig } from "../config/AppConfig.js";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider.js";
import type { Provider } from "./Provider.js";

type ProviderFactory = (config: ProviderConfig, apiKey: string) => Provider;

/** Register a factory here to support a new provider `type` in config/app.yaml. */
const factories: Record<string, ProviderFactory> = {
  "openai-compatible": (config, apiKey) => new OpenAICompatibleProvider(config, apiKey),
};

export function createProvider(name: string, config: ProviderConfig, apiKey: string): Provider {
  const factory = factories[config.type];
  if (!factory) throw new Error(`Provider "${name}" has unknown type "${config.type}"`);
  return factory(config, apiKey);
}
