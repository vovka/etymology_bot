import { Redis } from "@upstash/redis";
import type { KeyValueStore } from "./KeyValueStore.js";

/** Expects a client created with automaticDeserialization: false, so values stay plain strings. */
export class RedisStore implements KeyValueStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get<string>(key);
    return value === null ? null : String(value);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ttlSeconds);
    return count;
  }
}
