import { PARTIES } from '@avm/data';
import { generateWorld, type GeneratedWorld, type UnitProfile } from '@avm/engine';
import type { Db, Queryable } from '../db/index.js';

export interface SeedResult {
  seeded: boolean;
  seed: string;
  counts: Record<string, number>;
}

function profileOf<T extends UnitProfile>(u: T): UnitProfile {
  const { population, wealth, insecurity, issues, leanings, blocs } = u;
  return { population, wealth, insecurity, issues, leanings, blocs };
}

/** Insert many rows in one statement via jsonb_to_recordset. `columns` is "name type, ...". */
async function bulkInsert(tx: Queryable, table: string, columns: string, rows: object[]): Promise<void> {
  if (!rows.length) return;
  const names = columns
    .split(',')
    .map((c) => c.trim().split(/\s+/)[0])
    .join(', ');
  await tx.query(`INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS x(${columns})`, [JSON.stringify(rows)]);
}

/**
 * Generate the world from `seed` and write it. Idempotent: if a world already exists, nothing is written.
 * Everything happens in one transaction, so a failed seed leaves no partial world.
 */
export async function seedWorld(db: Db, seed: string): Promise<SeedResult> {
  const existing = await db.query<{ seed: string }>('SELECT seed FROM world_state WHERE id = 1');
  if (existing.rows[0]) return { seeded: false, seed: existing.rows[0].seed, counts: await countWorld(db) };

  const world: GeneratedWorld = generateWorld(seed);
  await db.transaction(async (tx) => {
    await bulkInsert(
      tx,
      'parties',
      'code text, name text, slogan text, color text, ideology text, is_independent boolean, is_system boolean',
      PARTIES.map((p) => ({ code: p.code, name: p.name, slogan: p.slogan, color: p.color, ideology: p.ideology, is_independent: !!p.isIndependent, is_system: true })),
    );
    await bulkInsert(
      tx,
      'states',
      'code text, name text, capital text, zone text, is_fct boolean, profile jsonb',
      world.states.map((s) => ({ code: s.code, name: s.name, capital: s.capital, zone: s.zone, is_fct: s.isFct, profile: profileOf(s) })),
    );
    await bulkInsert(
      tx,
      'lgas',
      'id text, state_code text, name text, is_capital boolean, profile jsonb',
      world.lgas.map((l) => ({ id: l.id, state_code: l.stateCode, name: l.name, is_capital: l.isCapital, profile: profileOf(l) })),
    );
    await bulkInsert(
      tx,
      'senatorial_districts',
      'id text, state_code text, name text, profile jsonb',
      world.districts.map((d) => ({ id: d.id, state_code: d.stateCode, name: d.name, profile: profileOf(d) })),
    );
    await bulkInsert(
      tx,
      'district_lgas',
      'district_id text, lga_id text',
      world.districts.flatMap((d) => d.lgaIds.map((lga_id) => ({ district_id: d.id, lga_id }))),
    );
    await bulkInsert(
      tx,
      'federal_constituencies',
      'id text, state_code text, name text, profile jsonb',
      world.constituencies.map((c) => ({ id: c.id, state_code: c.stateCode, name: c.name, profile: profileOf(c) })),
    );
    await bulkInsert(
      tx,
      'constituency_lgas',
      'constituency_id text, lga_id text, share numeric',
      world.constituencies.flatMap((c) => c.lgas.map((l) => ({ constituency_id: c.id, lga_id: l.lgaId, share: l.share }))),
    );
    await bulkInsert(
      tx,
      'seats',
      'id text, kind text, name text, state_code text, district_id text, constituency_id text, lga_id text',
      world.seats.map((s) => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        state_code: s.stateCode,
        district_id: s.districtId,
        constituency_id: s.constituencyId,
        lga_id: s.lgaId,
      })),
    );
    // NPCs reference parties by id; resolve codes inside SQL.
    await tx.query(
      `INSERT INTO npcs (id, name, gender, age, state_code, party_id, personality)
       SELECT x.id, x.name, x.gender, x.age, x.state_code, p.id, x.personality
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, gender text, age int, state_code text, party_code text, personality jsonb)
       JOIN parties p ON p.code = x.party_code`,
      [JSON.stringify(world.npcs.map((n) => ({ id: n.id, name: n.name, gender: n.gender, age: n.age, state_code: n.stateCode, party_code: n.partyCode, personality: n.personality })))],
    );
    await bulkInsert(
      tx,
      'seat_tenures',
      'seat_id text, holder_type text, npc_id text',
      world.npcs.map((n) => ({ seat_id: n.seatId, holder_type: 'npc', npc_id: n.id })),
    );
    await tx.query('INSERT INTO world_state (id, seed) VALUES (1, $1)', [seed]);
    await tx.query(`INSERT INTO audit_log (action, target_type, target_id, details) VALUES ('world.seeded', 'world', '1', $1::jsonb)`, [
      JSON.stringify({ seed, seats: world.seats.length, npcs: world.npcs.length }),
    ]);
  });
  return { seeded: true, seed, counts: await countWorld(db) };
}

export async function countWorld(db: Queryable): Promise<Record<string, number>> {
  const tables = ['states', 'lgas', 'senatorial_districts', 'federal_constituencies', 'parties', 'seats', 'npcs', 'seat_tenures'];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`);
    counts[t] = r.rows[0]?.n ?? 0;
  }
  return counts;
}
