import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { AppContext } from './context.js';
import { registerAuthRoutes, registerSessionHook } from './auth/routes.js';
import { registerWorldRoutes } from './world/routes.js';
import { errorHandler } from './game/core.js';
import { registerCharacterRoutes } from './game/characters.js';
import { registerPartyRoutes } from './game/parties.js';
import { registerCitizenRoutes } from './game/citizen.js';
import { registerFinanceRoutes } from './game/finance.js';
import { registerMediaRoutes } from './game/media.js';
import { registerChatRoutes } from './game/chat.js';
import { registerOfficeRoutes } from './game/offices.js';

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cookie, { secret: ctx.env.COOKIE_SECRET });
  // Limits are opt-in per route via `config.rateLimit`.
  await app.register(rateLimit, { global: false });
  app.setErrorHandler(errorHandler);

  registerSessionHook(app, ctx);

  app.get('/api/health', async () => {
    const r = await ctx.db.query<{ ok: number }>('SELECT 1 AS ok');
    return { status: 'ok', db: ctx.db.driver, dbOk: r.rows[0]?.ok === 1, kv: ctx.kv.backend };
  });

  registerAuthRoutes(app, ctx);
  registerWorldRoutes(app, ctx);
  registerCharacterRoutes(app, ctx);
  registerPartyRoutes(app, ctx);
  registerCitizenRoutes(app, ctx);
  registerFinanceRoutes(app, ctx);
  registerMediaRoutes(app, ctx);
  registerChatRoutes(app, ctx);
  registerOfficeRoutes(app, ctx);
  return app;
}
