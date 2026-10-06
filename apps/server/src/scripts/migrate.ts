import { loadEnv } from '../config.js';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';

const env = loadEnv();
const db = await createDb({ databaseUrl: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
await db.close();
