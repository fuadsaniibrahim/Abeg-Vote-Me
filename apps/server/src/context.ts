import type { Env, GameConfig } from './config.js';
import type { Db } from './db/index.js';
import type { Kv } from './redis.js';
import type { Realtime } from './game/notify.js';

/** Everything route handlers need, injected so tests can supply an in-memory DB. */
export interface AppContext {
  env: Env;
  game: GameConfig;
  db: Db;
  kv: Kv;
  /** Live push to connected clients; a no-op until Socket.IO is attached. */
  realtime: Realtime;
}
