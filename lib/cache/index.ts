import { Redis } from "@upstash/redis";

export interface KvCache {
  readonly name: string;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export class MemoryCache implements KvCache {
  readonly name = "memory";
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly maxEntries = 5000) {}

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export class UpstashCache implements KvCache {
  readonly name = "upstash";
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const v = await this.redis.get<T>(key);
      return v ?? undefined;
    } catch (err) {
      console.warn("[cache] redis get failed", err);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } catch (err) {
      console.warn("[cache] redis set failed", err);
    }
  }
}

/** Read-through helper. `undefined` results are not cached; wrap misses in an object to cache them. */
export async function cached<T>(cache: KvCache, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  if (value !== undefined) await cache.set(key, value, ttlSeconds);
  return value;
}

export function createCache(env: { UPSTASH_REDIS_URL?: string; UPSTASH_REDIS_TOKEN?: string }): KvCache {
  if (env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN) {
    return new UpstashCache(new Redis({ url: env.UPSTASH_REDIS_URL, token: env.UPSTASH_REDIS_TOKEN }));
  }
  return new MemoryCache();
}

export const TTL = {
  rates: 30 * 60,
  places: 15 * 60,
  routes: 30 * 60,
  geocode: 24 * 60 * 60,
} as const;
