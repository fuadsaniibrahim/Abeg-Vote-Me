import type { Env, GameConfig } from './config.js';
import type { Db } from './db/index.js';
import type { Kv } from './redis.js';

/** Everything route handlers need, injected so tests can supply an in-memory DB. */
export interface AppContext {
  env: Env;
  game: GameConfig;
  db: Db;
  kv: Kv;
}
