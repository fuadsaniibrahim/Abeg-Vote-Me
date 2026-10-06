import { buildApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { seedWorld } from './world/seed.js';
import { attachRealtime } from './realtime.js';
import { startTickScheduler } from './game/tick.js';

const ctx = await bootstrap();
const seeded = await seedWorld(ctx.db, ctx.env.WORLD_SEED);
const app = await buildApp(ctx, { logger: true });
const io = attachRealtime(app, ctx);
app.log.info({ db: ctx.db.driver, kv: ctx.kv.backend, world: seeded }, 'world ready');
const stopTicks = startTickScheduler(ctx, (m) => app.log.info(m));

const shutdown = async () => {
  stopTicks();
  await io.close();
  await app.close();
  await ctx.kv.close();
  await ctx.db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: ctx.env.PORT, host: ctx.env.HOST });
