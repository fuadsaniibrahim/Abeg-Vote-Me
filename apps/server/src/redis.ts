// Minimal key-value + pub/sub wrapper. Uses Redis when REDIS_URL is set, otherwise an in-memory
// fallback that only works within a single server process (see KNOWN_GAPS.md).
import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';

export interface Kv {
  readonly backend: 'redis' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  del(key: string): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export function createMemoryKv(now: () => number = Date.now): Kv {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  const bus = new EventEmitter();
  const live = (key: string) => {
    const e = store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= now()) {
      store.delete(key);
      return null;
    }
    return e;
  };
  return {
    backend: 'memory',
    async get(key) {
      return live(key)?.value ?? null;
    },
    async set(key, value, ttl) {
      store.set(key, { value, expiresAt: ttl ? now() + ttl * 1000 : null });
    },
    async incr(key, ttl) {
      const e = live(key);
      const n = (e ? Number(e.value) : 0) + 1;
      store.set(key, { value: String(n), expiresAt: e?.expiresAt ?? (ttl ? now() + ttl * 1000 : null) });
      return n;
    },
    async del(key) {
      store.delete(key);
    },
    async publish(channel, message) {
      bus.emit(channel, message);
    },
    async subscribe(channel, handler) {
      bus.on(channel, handler);
      return async () => {
        bus.off(channel, handler);
      };
    },
    async close() {
      store.clear();
      bus.removeAllListeners();
    },
  };
}

export function createRedisKv(url: string): Kv {
  const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  const sub = client.duplicate();
  const handlers = new Map<string, Set<(m: string) => void>>();
  sub.on('message', (channel: string, message: string) => handlers.get(channel)?.forEach((h) => h(message)));
  return {
    backend: 'redis',
    get: (key) => client.get(key),
    async set(key, value, ttl) {
      if (ttl) await client.set(key, value, 'EX', ttl);
      else await client.set(key, value);
    },
    async incr(key, ttl) {
      const n = await client.incr(key);
      if (n === 1 && ttl) await client.expire(key, ttl);
      return n;
    },
    async del(key) {
      await client.del(key);
    },
    async publish(channel, message) {
      await client.publish(channel, message);
    },
    async subscribe(channel, handler) {
      if (!handlers.has(channel)) {
        handlers.set(channel, new Set());
        await sub.subscribe(channel);
      }
      handlers.get(channel)?.add(handler);
      return async () => {
        handlers.get(channel)?.delete(handler);
      };
    },
    async close() {
      await Promise.all([client.quit(), sub.quit()]);
    },
  };
}

export function createKv(redisUrl?: string): Kv {
  return redisUrl ? createRedisKv(redisUrl) : createMemoryKv();
}
