import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context.js';
import { createTestContext } from './helpers.js';

let ctx: AppContext;
beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
});
afterAll(() => ctx.db.close());

async function makeCharacter(email: string): Promise<string> {
  const u = await ctx.db.query<{ id: string }>("INSERT INTO users (username, username_normalized, email, email_normalized, password_hash) VALUES ($2, lower($2), $1, $1, 'x') RETURNING id", [
    email,
    email.split('@')[0]!.replace(/[^A-Za-z0-9_]/g, '_'),
  ]);
  const c = await ctx.db.query<{ id: string }>(
    `INSERT INTO characters (user_id, name, gender, age, home_state_code, home_lga_id, background, traits, stats)
     VALUES ($1, 'Test Person', 'female', 30, 'LA', 'LA-011', 'lawyer', ARRAY['silver_tongue','clean_hands'], '{}') RETURNING id`,
    [u.rows[0]!.id],
  );
  return c.rows[0]!.id;
}

describe('seat_tenures constraints', () => {
  it('rejects a second active holder for the same seat', async () => {
    const charId = await makeCharacter('dup-holder@test.ng');
    await expect(
      ctx.db.query("INSERT INTO seat_tenures (seat_id, holder_type, character_id) VALUES ('GOV-LA', 'player', $1)", [charId]),
    ).rejects.toThrow(/seat_tenures_one_active_per_seat/);
  });

  it('allows a new holder after the current tenure ends (in one transaction)', async () => {
    const charId = await makeCharacter('new-holder@test.ng');
    await ctx.db.transaction(async (tx) => {
      await tx.query("UPDATE seat_tenures SET ended_at = now(), end_reason = 'lost_election' WHERE seat_id = 'REP-LA-FC01' AND ended_at IS NULL");
      await tx.query("INSERT INTO seat_tenures (seat_id, holder_type, character_id) VALUES ('REP-LA-FC01', 'player', $1)", [charId]);
    });
    const r = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM seat_tenures WHERE seat_id = 'REP-LA-FC01' AND ended_at IS NULL");
    expect(r.rows[0]!.n).toBe(1);
  });

  it('rejects a character holding two seats at once', async () => {
    const charId = await makeCharacter('two-seats@test.ng');
    await ctx.db.query("UPDATE seat_tenures SET ended_at = now() WHERE seat_id IN ('LGC-KN-001', 'LGC-KN-002') AND ended_at IS NULL");
    await ctx.db.query("INSERT INTO seat_tenures (seat_id, holder_type, character_id) VALUES ('LGC-KN-001', 'player', $1)", [charId]);
    await expect(
      ctx.db.query("INSERT INTO seat_tenures (seat_id, holder_type, character_id) VALUES ('LGC-KN-002', 'player', $1)", [charId]),
    ).rejects.toThrow(/seat_tenures_one_active_per_character/);
  });

  it('rejects a tenure whose holder type does not match its holder columns', async () => {
    await expect(ctx.db.query("INSERT INTO seat_tenures (seat_id, holder_type, npc_id) VALUES ('SEN-KN-SD1', 'player', 'npc-PRES')")).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe('characters and parties constraints', () => {
  it('rejects negative wallet and war chest balances', async () => {
    const charId = await makeCharacter('broke@test.ng');
    await expect(ctx.db.query('UPDATE characters SET wallet = -1 WHERE id = $1', [charId])).rejects.toThrow(/check constraint/);
    await expect(ctx.db.query('UPDATE characters SET war_chest = -1 WHERE id = $1', [charId])).rejects.toThrow(/check constraint/);
  });

  it('allows only one active party membership per character', async () => {
    const charId = await makeCharacter('party-hopper@test.ng');
    await ctx.db.query("INSERT INTO party_memberships (party_id, character_id) SELECT id, $1 FROM parties WHERE code = 'PUP'", [charId]);
    await expect(
      ctx.db.query("INSERT INTO party_memberships (party_id, character_id) SELECT id, $1 FROM parties WHERE code = 'NDA'", [charId]),
    ).rejects.toThrow(/party_memberships_one_active/);
  });

  it('allows only one character per user account', async () => {
    const u = await ctx.db.query<{ id: string }>("INSERT INTO users (username, username_normalized, email, email_normalized, password_hash) VALUES ('one','one','one@test.ng','one@test.ng','x') RETURNING id");
    const insert = () =>
      ctx.db.query(
        `INSERT INTO characters (user_id, name, gender, age, home_state_code, home_lga_id, background, traits, stats)
         VALUES ($1, 'A', 'male', 40, 'KN', 'KN-001', 'trader', ARRAY['a','b'], '{}')`,
        [u.rows[0]!.id],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/characters_user_id_key/);
  });
});

describe('audit_log', () => {
  it('is append-only: updates and deletes are blocked by trigger', async () => {
    await ctx.db.query("INSERT INTO audit_log (action) VALUES ('test.entry')");
    await expect(ctx.db.query("UPDATE audit_log SET action = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(ctx.db.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('world_state', () => {
  it('holds exactly one row', async () => {
    await expect(ctx.db.query("INSERT INTO world_state (id, seed) VALUES (2, 'x')")).rejects.toThrow(/check constraint/);
    const r = await ctx.db.query<{ seed: string }>('SELECT seed FROM world_state');
    expect(r.rows).toEqual([{ seed: 'test-world' }]);
  });
});
