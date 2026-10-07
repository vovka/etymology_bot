import type { KeyValueStore } from "../storage/KeyValueStore.js";

const HOUR_SECONDS = 3600;

export class UserRateLimiter {
  constructor(private readonly store: KeyValueStore, private readonly requestsPerHour: number) {}

  async tryConsume(userId: number): Promise<boolean> {
    const window = Math.floor(Date.now() / 1000 / HOUR_SECONDS);
    const count = await this.store.increment(`ratelimit:${userId}:${window}`, HOUR_SECONDS);
    return count <= this.requestsPerHour;
  }
}
