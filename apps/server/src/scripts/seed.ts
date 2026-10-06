import { bootstrap } from '../bootstrap.js';
import { termMs } from '../config.js';
import { seedWorld } from '../world/seed.js';

const ctx = await bootstrap();
const result = await seedWorld(ctx.db, ctx.env.WORLD_SEED, { termMs: termMs(ctx.game) });
console.log(JSON.stringify(result, null, 2));
await ctx.kv.close();
await ctx.db.close();
