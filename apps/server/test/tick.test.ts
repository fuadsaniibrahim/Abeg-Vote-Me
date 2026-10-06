import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { runDueTicks, runOneTick } from '../src/game/tick.js';
import { createTestContext } from './helpers.js';
import { makePlayer, walletOf } from './players.js';

let ctx: AppContext;
let app: FastifyInstance;
const MONTH = 86_400_000;

beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 10_000 } };
  app = await buildApp(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.db.close();
});

async function epoch(): Promise<number> {
  const r = await ctx.db.query<{ clock_epoch: Date }>('SELECT clock_epoch FROM world_state WHERE id = 1');
  return new Date(r.rows[0]!.clock_epoch).getTime();
}

describe('world tick', () => {
  it('does nothing before the first month has passed', async () => {
    expect(await runDueTicks(ctx, (await epoch()) + MONTH / 2)).toEqual([]);
  });

  it('catches up every missed month, pays business income, updates the economy and is idempotent', async () => {
    const p = await makePlayer(app, ctx);
    await p.call('POST', '/api/businesses', { name: 'Steady Shop', sector: 'provisions', capital: 1_000_000 });
    const before = await walletOf(ctx, p.characterId);
    const now = (await epoch()) + 3 * MONTH + 1000;

    const reps = await runDueTicks(ctx, now);
    expect(reps.map((r) => r.turn)).toEqual([1, 2, 3]);
    const after = await walletOf(ctx, p.characterId);
    const income = await ctx.db.query<{ n: number; total: number }>("SELECT count(*)::int AS n, COALESCE(sum(delta), 0)::bigint AS total FROM transactions WHERE character_id = $1 AND reason = 'business_income'", [p.characterId]);
    expect(after.wallet - before.wallet).toBe(Number(income.rows[0]!.total));
    expect(income.rows[0]!.n).toBeGreaterThanOrEqual(1);

    const ws = await ctx.db.query<{ last_tick_turn: number; economy: { inflation: number } }>('SELECT last_tick_turn, economy FROM world_state');
    expect(ws.rows[0]!.last_tick_turn).toBe(3);
    expect(ws.rows[0]!.economy.inflation).toBeTypeOf('number');

    // running again at the same time does nothing
    expect(await runDueTicks(ctx, now)).toEqual([]);
    const ticks = await ctx.db.query<{ turn: number }>("SELECT (details->>'turn')::int AS turn FROM audit_log WHERE action = 'world.tick' ORDER BY id");
    expect(ticks.rows.map((r) => r.turn)).toEqual([1, 2, 3]);

    const news = await ctx.db.query("SELECT 1 FROM news_items WHERE kind = 'economy_monthly'");
    expect(news.rows).toHaveLength(3);
    const notes = (await p.call('GET', '/api/notifications')).body.notifications.filter((n: { kind: string }) => n.kind === 'business_income');
    expect(notes.length).toBeGreaterThanOrEqual(1);
  });

  it('concurrent tick runners never process the same turn twice', async () => {
    const results = await Promise.all([runOneTick(ctx), runOneTick(ctx), runOneTick(ctx)]);
    const turns = results.filter(Boolean).map((r) => r!.turn).sort((a, b) => a - b);
    expect(new Set(turns).size).toBe(turns.length);
    const all = await ctx.db.query<{ turn: number }>("SELECT (details->>'turn')::int AS turn FROM audit_log WHERE action = 'world.tick'");
    const list = all.rows.map((r) => r.turn);
    expect(new Set(list).size).toBe(list.length);
  });

  it('caps catch-up at maxCatchUpTurns per run', async () => {
    const saved = ctx.game.tick;
    ctx.game = { ...ctx.game, tick: { ...saved, maxCatchUpTurns: 2 } };
    const reps = await runDueTicks(ctx, (await epoch()) + 40 * MONTH);
    expect(reps).toHaveLength(2);
    ctx.game = { ...ctx.game, tick: saved };
  });
});
