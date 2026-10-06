import { describe, expect, it } from 'vitest';
import { createKv, createMemoryKv } from '../src/redis.js';

describe('memory kv fallback', () => {
  it('is chosen when no REDIS_URL is given', () => {
    expect(createKv(undefined).backend).toBe('memory');
  });

  it('gets, sets, deletes and expires keys', async () => {
    let now = 1000;
    const kv = createMemoryKv(() => now);
    await kv.set('a', '1', 10);
    expect(await kv.get('a')).toBe('1');
    now += 11_000;
    expect(await kv.get('a')).toBeNull();
    await kv.set('b', '2');
    await kv.del('b');
    expect(await kv.get('b')).toBeNull();
  });

  it('increments counters with a TTL window', async () => {
    let now = 0;
    const kv = createMemoryKv(() => now);
    expect(await kv.incr('c', 60)).toBe(1);
    expect(await kv.incr('c', 60)).toBe(2);
    now += 61_000;
    expect(await kv.incr('c', 60)).toBe(1);
  });

  it('delivers published messages to subscribers until unsubscribed', async () => {
    const kv = createMemoryKv();
    const got: string[] = [];
    const off = await kv.subscribe('news', (m) => got.push(m));
    await kv.publish('news', 'breaking');
    await off();
    await kv.publish('news', 'ignored');
    expect(got).toEqual(['breaking']);
  });
});
