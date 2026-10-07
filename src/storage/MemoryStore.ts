import type { KeyValueStore } from "./KeyValueStore.js";

/** Fallback when Redis is not configured: state lives only as long as the function instance. */
export class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = await this.get(key);
    const count = Number(current ?? 0) + 1;
    const expiresAt = current === null ? Date.now() + ttlSeconds * 1000 : this.entries.get(key)!.expiresAt;
    this.entries.set(key, { value: String(count), expiresAt });
    return count;
  }
}
