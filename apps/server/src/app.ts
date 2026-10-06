import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { AppContext } from './context.js';
import { registerAuthRoutes, registerSessionHook } from './auth/routes.js';
import { registerWorldRoutes } from './world/routes.js';

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cookie, { secret: ctx.env.COOKIE_SECRET });
  // Limits are opt-in per route via `config.rateLimit`.
  await app.register(rateLimit, { global: false });

  registerSessionHook(app, ctx);

  app.get('/api/health', async () => {
    const r = await ctx.db.query<{ ok: number }>('SELECT 1 AS ok');
    return { status: 'ok', db: ctx.db.driver, dbOk: r.rows[0]?.ok === 1, kv: ctx.kv.backend };
  });

  registerAuthRoutes(app, ctx);
  registerWorldRoutes(app, ctx);
  return app;
}
