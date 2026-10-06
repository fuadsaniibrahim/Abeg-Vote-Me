import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context.js';
import { generateWorld } from '@avm/engine';
import { DEFAULT_TERM_MS, seedWorld, upgradeWorld } from '../src/world/seed.js';
import { createTestContext } from './helpers.js';

const expected = generateWorld('seed-test');
const SEATS = expected.seats.length;

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
      wards: expected.wards.length,
      parties: 5,
      seats: SEATS,
      npcs: SEATS,
      seat_tenures: SEATS,
    });
    expect(SEATS).toBe(1317 + 2 * expected.wards.length);
  });

  it('gives every seeded holder a first term ending one term after seeding', async () => {
    const r = await ctx.db.query<{ n: number; lo: Date; hi: Date; ws: Date }>(
      `SELECT count(*)::int AS n, min(term_ends_at) AS lo, max(term_ends_at) AS hi, (SELECT seeded_at FROM world_state) AS ws
       FROM seat_tenures WHERE ended_at IS NULL`,
    );
    const row = r.rows[0]!;
    expect(row.n).toBe(SEATS);
    expect(new Date(row.lo).getTime()).toBe(new Date(row.hi).getTime());
    expect(Math.abs(new Date(row.hi).getTime() - new Date(row.ws).getTime() - DEFAULT_TERM_MS)).toBeLessThan(60_000);
  });

  it('stores wards with a councillor and a ward chairman seat each', async () => {
    const r = await ctx.db.query<{ kind: string; n: number }>(
      `SELECT s.kind, count(*)::int AS n FROM seats s JOIN wards w ON w.id = s.ward_id GROUP BY s.kind ORDER BY s.kind`,
    );
    expect(r.rows).toEqual([
      { kind: 'COUNCILLOR', n: expected.wards.length },
      { kind: 'WARD_CHAIRMAN', n: expected.wards.length },
    ]);
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
    expect(again.counts.seats).toBe(SEATS);
  });

  it('upgrades a world seeded before wards existed, matching a fresh seed', async () => {
    const old = await createTestContext();
    try {
      await seedWorld(old.db, 'seed-test');
      // simulate the pre-ward world: remove ward seats, their NPCs and wards, and clear term ends
      await old.db.exec(`
        ALTER TABLE seat_tenures DISABLE TRIGGER seat_tenures_audit;
        DELETE FROM seat_tenures WHERE seat_id IN (SELECT id FROM seats WHERE ward_id IS NOT NULL);
        DELETE FROM npcs WHERE id NOT IN (SELECT npc_id FROM seat_tenures WHERE npc_id IS NOT NULL);
        DELETE FROM seats WHERE ward_id IS NOT NULL;
        DELETE FROM wards;
        UPDATE seat_tenures SET term_ends_at = NULL;
        ALTER TABLE seat_tenures ENABLE TRIGGER seat_tenures_audit;`);
      expect((await old.db.query<{ n: number }>('SELECT count(*)::int AS n FROM seats')).rows[0]!.n).toBe(1317);

      const up = await upgradeWorld(old.db, 'seed-test', DEFAULT_TERM_MS);
      expect(up).toEqual({ wardsAdded: expected.wards.length, termsSet: 1317 });
      const again = await seedWorld(old.db, 'seed-test');
      expect(again.counts).toEqual((await seedWorld(ctx.db, 'seed-test')).counts);
      const npc = await old.db.query<{ name: string }>("SELECT name FROM npcs WHERE id = 'npc-CLR-LA-011-W01'");
      expect(npc.rows[0]!.name).toBe(expected.npcs.find((n) => n.id === 'npc-CLR-LA-011-W01')!.name);
      // second upgrade is a no-op
      expect(await upgradeWorld(old.db, 'seed-test', DEFAULT_TERM_MS)).toEqual({ wardsAdded: 0, termsSet: 0 });
    } finally {
      await old.db.close();
    }
  });

  it('writes an audit entry for the seed', async () => {
    const r = await ctx.db.query("SELECT action FROM audit_log WHERE action = 'world.seeded'");
    expect(r.rows).toHaveLength(1);
  });
});
