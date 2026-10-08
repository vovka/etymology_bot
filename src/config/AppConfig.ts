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

export const appConfigSchema = z
  .object({
    providers: z.record(z.string(), providerSchema),
    modelChain: z.array(chainEntrySchema).min(1),
    llm: z.object({
      requestTimeoutMs: z.number().positive(),
      maxTokens: z.number().int().positive(),
      temperature: z.number().min(0).max(2),
    }),
    agent: z.object({
      maxSteps: z.number().int().positive(),
      maxToolCallsPerStep: z.number().int().positive(),
      timeBudgetMs: z.number().positive(),
    }),
    cooldown: z.object({ defaultSeconds: z.number().positive(), dailyQuotaSeconds: z.number().positive() }),
    research: z.object({
      sources: z.array(z.string()),
      timeoutMs: z.number().positive(),
      maxCharsPerSource: z.number().int().positive(),
      userAgent: z.string(),
    }),
    cache: z.object({ enabled: z.boolean(), ttlSeconds: z.number().int().positive() }),
    rateLimit: z.object({ requestsPerUserPerHour: z.number().int().positive() }),
    query: z.object({ maxWords: z.number().int().positive(), maxLength: z.number().int().positive() }),
    reply: z.object({ defaultLanguage: z.string() }),
  })
  .refine((config) => config.modelChain.every((entry) => entry.provider in config.providers), {
    message: "Every modelChain entry must reference a provider defined under providers",
  });

export type AppConfig = z.infer<typeof appConfigSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type ChainEntry = z.infer<typeof chainEntrySchema>;
