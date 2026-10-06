import { resolve } from 'node:path';
import { loadEnv, loadGameConfig, termMs, type GameConfig } from '../src/config.js';
import { createPgliteDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createMemoryKv } from '../src/redis.js';
import type { AppContext } from '../src/context.js';
import { seedWorld } from '../src/world/seed.js';
import { noRealtime } from '../src/game/notify.js';

export async function createTestContext(opts: { seed?: boolean; game?: Partial<GameConfig> } = {}): Promise<AppContext> {
  const env = loadEnv({ NODE_ENV: 'test', PGLITE_DIR: 'memory' });
  const game = { ...loadGameConfig(resolve(import.meta.dirname, '../../../config/game.json')), ...opts.game };
  const db = await createPgliteDb('memory');
  await migrate(db);
  if (opts.seed) await seedWorld(db, 'test-world', { termMs: termMs(game) });
  return { env, game, db, kv: createMemoryKv(), realtime: noRealtime };
}

/** Extract "name=value" for a cookie from a set-cookie header. */
export function cookieFrom(setCookie: string | string[] | undefined, name: string): string | undefined {
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of all) {
    const first = c.split(';')[0] ?? '';
    if (first.startsWith(`${name}=`)) return first;
  }
  return undefined;
}
