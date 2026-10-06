import { loadEnv, loadGameConfig, type Env } from './config.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { createKv } from './redis.js';
import type { AppContext } from './context.js';
import { noRealtime } from './game/notify.js';

/** Load config, open the DB (Postgres or PGlite) and Redis (or memory), and run migrations. */
export async function bootstrap(env: Env = loadEnv()): Promise<AppContext> {
  const game = loadGameConfig(env.GAME_CONFIG_PATH);
  const db = await createDb({ databaseUrl: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
  await migrate(db);
  const kv = createKv(env.REDIS_URL);
  return { env, game, db, kv, realtime: noRealtime };
}
