import { Redis } from "@upstash/redis";
import type { KeyValueStore } from "./KeyValueStore.js";
import { MemoryStore } from "./MemoryStore.js";
import { RedisStore } from "./RedisStore.js";

export function createStore(): KeyValueStore {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.warn("Redis not configured: using in-memory store (no persistent cache, cooldowns or limits)");
    return new MemoryStore();
  }
  return new RedisStore(new Redis({ url, token, automaticDeserialization: false }));
}
