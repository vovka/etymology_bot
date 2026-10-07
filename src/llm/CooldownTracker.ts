import type { AppConfig, ChainEntry } from "../config/AppConfig.js";
import type { RateLimitError } from "../providers/Provider.js";
import type { KeyValueStore } from "../storage/KeyValueStore.js";

/** Remembers which models hit their limits, so later requests skip them without a wasted call. */
export class CooldownTracker {
  constructor(private readonly store: KeyValueStore, private readonly config: AppConfig["cooldown"]) {}

  async isCoolingDown(entry: ChainEntry): Promise<boolean> {
    return (await this.store.get(this.key(entry))) !== null;
  }

  async coolDown(entry: ChainEntry, error: RateLimitError): Promise<number> {
    const seconds = Math.ceil(this.durationFor(entry, error));
    await this.store.set(this.key(entry), "1", seconds);
    return seconds;
  }

  private durationFor(entry: ChainEntry, error: RateLimitError): number {
    if (error.retryAfterSeconds) return error.retryAfterSeconds;
    if (error.isDailyQuota) return this.config.dailyQuotaSeconds;
    return entry.cooldownSeconds ?? this.config.defaultSeconds;
  }

  private key(entry: ChainEntry): string {
    return `cooldown:${entry.provider}:${entry.model}`;
  }
}
