import type { Bot } from "grammy";
import type { AppConfig } from "./config/AppConfig.js";
import { loadConfig } from "./config/loadConfig.js";
import { createBot } from "./bot/createBot.js";
import { EtymologyHandler } from "./bot/EtymologyHandler.js";
import { UserRateLimiter } from "./bot/UserRateLimiter.js";
import { ExplorationAgent } from "./etymology/agent/ExplorationAgent.js";
import { EtymologyService } from "./etymology/EtymologyService.js";
import { CooldownTracker } from "./llm/CooldownTracker.js";
import { ModelChain, type ChainLink } from "./llm/ModelChain.js";
import { createProvider } from "./providers/createProvider.js";
import { createHttpGet, createSources } from "./research/createSources.js";
import { Researcher } from "./research/Researcher.js";
import { createStore } from "./storage/createStore.js";
import { requireEnv } from "./utils/requireEnv.js";

/** Composition root: wires config, storage, providers and the bot together. */
export function createApp(config: AppConfig = loadConfig()): Bot {
  const store = createStore();
  const chain = new ModelChain(buildLinks(config), new CooldownTracker(store, config.cooldown), config.llm);
  const get = createHttpGet(config.research);
  const researcher = new Researcher(createSources(config.research, get), config.research.maxCharsPerSource);
  const agent = new ExplorationAgent(chain, get, config.agent, config.research.maxCharsPerSource);
  const service = new EtymologyService(researcher, agent, store, config.cache);
  const limiter = new UserRateLimiter(store, config.rateLimit.requestsPerUserPerHour);
  return createBot(requireEnv("TELEGRAM_BOT_TOKEN"), new EtymologyHandler(service, limiter, config));
}

/** Skips models whose provider has no API key, so the bot runs with just one provider configured. */
function buildLinks(config: AppConfig): ChainLink[] {
  const links = config.modelChain.flatMap((entry) => {
    const providerConfig = config.providers[entry.provider];
    const apiKey = process.env[providerConfig.apiKeyEnv];
    return apiKey ? [{ entry, provider: createProvider(entry.provider, providerConfig, apiKey) }] : [];
  });
  if (links.length === 0) throw new Error("No model in modelChain has its provider's API key set");
  return links;
}
