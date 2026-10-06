import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context.js';
import { seedWorld } from '../src/world/seed.js';
import { createTestContext } from './helpers.js';

let ctx: AppContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.db.close());

describe('seedWorld', () => {
  it('writes the full world with correct counts', async () => {
    const r = await seedWorld(ctx.db, 'seed-test');
    expect(r.seeded).toBe(true);
    expect(r.counts).toEqual({
      states: 37,
      lgas: 774,
      senatorial_districts: 109,
      federal_constituencies: 360,
      parties: 5,
      seats: 1317,
      npcs: 1317,
      seat_tenures: 1317,
    });
  });

  it('gives every seat exactly one active NPC holder', async () => {
    const r = await ctx.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM seats s
       WHERE (SELECT count(*) FROM seat_tenures t WHERE t.seat_id = s.id AND t.ended_at IS NULL AND t.holder_type = 'npc') <> 1`,
    );
    expect(r.rows[0]!.n).toBe(0);
  });

  it('links every LGA to one district and constituency shares summing to 1', async () => {
    const d = await ctx.db.query<{ n: number }>('SELECT count(DISTINCT lga_id)::int AS n FROM district_lgas');
    expect(d.rows[0]!.n).toBe(774);
    const c = await ctx.db.query<{ bad: number }>(
      'SELECT count(*)::int AS bad FROM (SELECT lga_id, sum(share) AS s FROM constituency_lgas GROUP BY lga_id) x WHERE abs(s - 1) > 0.000001',
    );
    expect(c.rows[0]!.bad).toBe(0);
  });

  it('stores unit profiles with population, blocs and leanings', async () => {
    const r = await ctx.db.query<{ profile: { population: number; blocs: unknown[]; leanings: Record<string, number> } }>(
      "SELECT profile FROM lgas WHERE id = 'LA-011'",
    );
    const p = r.rows[0]!.profile;
    expect(p.population).toBeGreaterThan(0);
    expect(p.blocs).toHaveLength(7);
    expect(Object.keys(p.leanings)).toEqual(expect.arrayContaining(['PUP', 'NDA', 'PRM', 'LF']));
  });

  it('is idempotent: seeding again writes nothing and keeps the original seed', async () => {
    const again = await seedWorld(ctx.db, 'different-seed');
    expect(again.seeded).toBe(false);
    expect(again.seed).toBe('seed-test');
    expect(again.counts.seats).toBe(1317);
  });

  it('writes an audit entry for the seed', async () => {
    const r = await ctx.db.query("SELECT action FROM audit_log WHERE action = 'world.seeded'");
    expect(r.rows).toHaveLength(1);
  });
});
