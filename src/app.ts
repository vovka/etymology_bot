import { neon } from "@neondatabase/serverless";
import { Bot } from "grammy";
import { Checkout } from "./billing/Checkout.js";
import { TIERS, type Tier } from "./billing/Tier.js";
import { UserRepository } from "./billing/UserRepository.js";
import { EtymologyHandler } from "./bot/EtymologyHandler.js";
import { DemoExamples } from "./bot/features/DemoExamples.js";
import { PaymentCommands } from "./bot/features/PaymentCommands.js";
import { SupportRelay } from "./bot/features/SupportRelay.js";
import { registerHandlers } from "./bot/registerHandlers.js";
import { UserRateLimiter } from "./bot/UserRateLimiter.js";
import type { AppConfig, ChainEntry } from "./config/AppConfig.js";
import { loadConfig } from "./config/loadConfig.js";
import { ExplorationAgent } from "./etymology/agent/ExplorationAgent.js";
import { DirectWriter } from "./etymology/DirectWriter.js";
import { EtymologyService } from "./etymology/EtymologyService.js";
import type { Writer } from "./etymology/Writer.js";
import { CooldownTracker } from "./llm/CooldownTracker.js";
import { ModelChain, type ChainLink } from "./llm/ModelChain.js";
import { createProvider } from "./providers/createProvider.js";
import { createHttpGet, createSources } from "./research/createSources.js";
import { Researcher } from "./research/Researcher.js";
import type { HttpGet } from "./research/Source.js";
import type { KeyValueStore } from "./storage/KeyValueStore.js";
import { createStore } from "./storage/createStore.js";
import { requireEnv } from "./utils/requireEnv.js";

/** Composition root: wires config, storage, providers and the bot together. */
export function createApp(config: AppConfig = loadConfig()): Bot {
  const store = createStore();
  const bot = new Bot(requireEnv("TELEGRAM_BOT_TOKEN"));
  const users = new UserRepository(neon(requireEnv("DATABASE_URL")));
  const services = createServices(config, store);
  return registerHandlers(bot, {
    etymology: new EtymologyHandler(services, users, new UserRateLimiter(store), config),
    payments: new PaymentCommands(new Checkout(bot.api, users, config.tiers), users, config.tiers),
    support: new SupportRelay(config.support.adminChatId, users),
    demos: new DemoExamples(services, config),
  }, config);
}

/** One answer pipeline per tier: its own model chain, writer and cache; research and cooldowns are shared. */
function createServices(config: AppConfig, store: KeyValueStore): Record<Tier, EtymologyService> {
  const cooldowns = new CooldownTracker(store, config.cooldown);
  const get = createHttpGet(config.research);
  const researcher = new Researcher(createSources(config.research, get), config.research.maxCharsPerSource);
  const service = (tier: Tier) => {
    const chain = new ModelChain(buildLinks(config, config.tiers[tier].modelChain), cooldowns, config.llm);
    return new EtymologyService(researcher, createWriter(config, tier, chain, get), store, config.cache, tier);
  };
  return Object.fromEntries(TIERS.map((tier) => [tier, service(tier)])) as Record<Tier, EtymologyService>;
}

function createWriter(config: AppConfig, tier: Tier, chain: ModelChain, get: HttpGet): Writer {
  if (!config.tiers[tier].agent) return new DirectWriter(chain);
  return new ExplorationAgent(chain, get, config.agent, config.research.maxCharsPerSource);
}

/** Skips models whose provider has no API key, so the bot runs with just one provider configured. */
function buildLinks(config: AppConfig, modelChain: ChainEntry[]): ChainLink[] {
  const links = modelChain.flatMap((entry) => {
    const providerConfig = config.providers[entry.provider];
    const apiKey = process.env[providerConfig.apiKeyEnv];
    return apiKey ? [{ entry, provider: createProvider(entry.provider, providerConfig, apiKey) }] : [];
  });
  if (links.length === 0) throw new Error("No model in a tier's modelChain has its provider's API key set");
  return links;
}
