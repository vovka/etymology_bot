export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Increments a counter; the TTL applies only when the key is created. */
  increment(key: string, ttlSeconds: number): Promise<number>;
}
