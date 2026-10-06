import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { countWorld } from './seed.js';

export function registerWorldRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/world/summary', async () => {
    const ws = await ctx.db.query<{ seed: string; seeded_at: string }>('SELECT seed, seeded_at FROM world_state WHERE id = 1');
    const npcHeld = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM seat_tenures WHERE ended_at IS NULL AND holder_type = 'npc'");
    const playerHeld = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM seat_tenures WHERE ended_at IS NULL AND holder_type = 'player'");
    return {
      seeded: !!ws.rows[0],
      seed: ws.rows[0]?.seed ?? null,
      counts: await countWorld(ctx.db),
      seatsHeldByNpcs: npcHeld.rows[0]?.n ?? 0,
      seatsHeldByPlayers: playerHeld.rows[0]?.n ?? 0,
    };
  });
}
