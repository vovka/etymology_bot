import { z } from "zod";

const providerSchema = z.object({
  type: z.string(),
  baseUrl: z.url(),
  apiKeyEnv: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
});

const chainEntrySchema = z.object({
  provider: z.string(),
  model: z.string(),
  cooldownSeconds: z.number().positive().optional(),
  // Overrides llm.temperature; null leaves it out (models such as Claude Haiku 5.5 reject non-default values).
  temperature: z.number().min(0).max(2).nullable().optional(),
  // Overrides agent.maxSteps, e.g. more rounds for free models that need room to reason.
  maxSteps: z.number().int().positive().optional(),
  extraBody: z.record(z.string(), z.unknown()).default({}),
});

// Nested lists are flattened, so a chain can reuse another one through a YAML alias.
const modelChainSchema = z
  .array(z.union([chainEntrySchema, z.array(chainEntrySchema)]))
  .min(1)
  .transform((entries) => entries.flat());

const tierSchema = z.object({
  // true: the agent explores with research tools before writing; false: it writes straight from the sources;
  // "unlimited": it explores with no step or per-round lookup limits, bounded only by agent.unlimitedTimeBudgetMs.
  agent: z.union([z.boolean(), z.literal("unlimited")]),
  // null: no hourly limit.
  requestsPerHour: z.number().int().positive().nullable(),
  // true: the agent can also search the open web and read any page (needs web.apiKeyEnv set).
  webSearch: z.boolean().default(false),
  modelChain: modelChainSchema,
});

const paidTierSchema = tierSchema.extend({ priceStars: z.number().int().min(1).max(10000) });

export const appConfigSchema = z
  .object({
    providers: z.record(z.string(), providerSchema),
    tiers: z.object({ free: tierSchema, basic: paidTierSchema, pro: paidTierSchema, unlimited: paidTierSchema }),
    llm: z.object({
      requestTimeoutMs: z.number().positive(),
      maxTokens: z.number().int().positive(),
      temperature: z.number().min(0).max(2),
    }),
    agent: z.object({
      maxSteps: z.number().int().positive(),
      maxToolCallsPerStep: z.number().int().positive(),
      timeBudgetMs: z.number().positive(),
      unlimitedTimeBudgetMs: z.number().positive(),
    }),
    cooldown: z.object({ defaultSeconds: z.number().positive(), dailyQuotaSeconds: z.number().positive() }),
    research: z.object({
      sources: z.array(z.string()),
      timeoutMs: z.number().positive(),
      maxCharsPerSource: z.number().int().positive(),
      userAgent: z.string(),
    }),
    web: z.object({
      apiKeyEnv: z.string(),
      maxResults: z.number().int().min(1).max(20),
      timeoutMs: z.number().positive(),
    }),
    cache: z.object({ enabled: z.boolean(), ttlSeconds: z.number().int().positive() }),
    query: z.object({ maxWords: z.number().int().positive(), maxLength: z.number().int().positive() }),
    reply: z.object({ defaultLanguage: z.string() }),
    support: z.object({ adminChatId: z.number().int() }),
    demo: z.object({ word: z.string() }),
  })
  .refine((config) => allChainEntries(config).every((entry) => entry.provider in config.providers), {
    message: "Every modelChain entry must reference a provider defined under providers",
  });

export type AppConfig = z.infer<typeof appConfigSchema>;
export type TierConfig = z.infer<typeof tierSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type ChainEntry = z.infer<typeof chainEntrySchema>;

export function allChainEntries(config: { tiers: Record<string, { modelChain: ChainEntry[] }> }): ChainEntry[] {
  return Object.values(config.tiers).flatMap((tier) => tier.modelChain);
}
