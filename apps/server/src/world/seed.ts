import { PARTIES } from '@avm/data';
import { generateWorld, type GeneratedWorld, type GenNpc, type GenSeat, type GenWard, type UnitProfile } from '@avm/engine';
import type { Db, Queryable } from '../db/index.js';

/** Default term length when no config is passed: 4 game years at 1 game month per real day. */
export const DEFAULT_TERM_MS = 4 * 12 * 86_400_000;

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
 * Generate the world from `seed` and write it. Idempotent: if a world already exists, nothing is written
 * (except the upgrade steps in `upgradeWorld` for worlds seeded before wards and terms existed).
 * Everything happens in one transaction, so a failed seed leaves no partial world.
 * `termMs` is the real length of a term; every seeded holder's first term ends that long after seeding.
 */
export async function seedWorld(db: Db, seed: string, opts: { termMs?: number } = {}): Promise<SeedResult> {
  const termMs = opts.termMs ?? DEFAULT_TERM_MS;
  const existing = await db.query<{ seed: string }>('SELECT seed FROM world_state WHERE id = 1');
  if (existing.rows[0]) {
    await upgradeWorld(db, existing.rows[0].seed, termMs);
    return { seeded: false, seed: existing.rows[0].seed, counts: await countWorld(db) };
  }

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
    await insertWards(tx, world.wards);
    await insertSeatsWithNpcs(tx, world.seats, world.npcs, new Date(Date.now() + termMs));
    await tx.query('INSERT INTO world_state (id, seed) VALUES (1, $1)', [seed]);
    await tx.query(`INSERT INTO audit_log (action, target_type, target_id, details) VALUES ('world.seeded', 'world', '1', $1::jsonb)`, [
      JSON.stringify({ seed, seats: world.seats.length, npcs: world.npcs.length }),
    ]);
  });
  return { seeded: true, seed, counts: await countWorld(db) };
}

async function insertWards(tx: Queryable, wards: GenWard[]): Promise<void> {
  await bulkInsert(
    tx,
    'wards',
    'id text, lga_id text, state_code text, number int, name text',
    wards.map((w) => ({ id: w.id, lga_id: w.lgaId, state_code: w.stateCode, number: w.number, name: w.name })),
  );
}

/** Seats, their NPC placeholders and one active (seeded) tenure each. */
async function insertSeatsWithNpcs(tx: Queryable, seats: GenSeat[], npcs: GenNpc[], termEndsAt: Date): Promise<void> {
  await bulkInsert(
    tx,
    'seats',
    'id text, kind text, name text, state_code text, district_id text, constituency_id text, lga_id text, ward_id text',
    seats.map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      state_code: s.stateCode,
      district_id: s.districtId,
      constituency_id: s.constituencyId,
      lga_id: s.lgaId,
      ward_id: s.wardId,
    })),
  );
  await insertNpcs(tx, npcs);
  await bulkInsert(
    tx,
    'seat_tenures',
    'seat_id text, holder_type text, npc_id text, term_ends_at timestamptz',
    npcs.map((n) => ({ seat_id: n.seatId, holder_type: 'npc', npc_id: n.id, term_ends_at: termEndsAt.toISOString() })),
  );
}

/** NPCs reference parties by id; codes are resolved inside SQL. */
export async function insertNpcs(tx: Queryable, npcs: GenNpc[]): Promise<void> {
  if (!npcs.length) return;
  await tx.query(
    `INSERT INTO npcs (id, name, gender, age, state_code, party_id, personality)
     SELECT x.id, x.name, x.gender, x.age, x.state_code, p.id, x.personality
     FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, gender text, age int, state_code text, party_code text, personality jsonb)
     JOIN parties p ON p.code = x.party_code`,
    [JSON.stringify(npcs.map((n) => ({ id: n.id, name: n.name, gender: n.gender, age: n.age, state_code: n.stateCode, party_code: n.partyCode, personality: n.personality })))],
  );
}

/**
 * Bring a world seeded by an older version up to date, idempotently:
 * add wards and ward seats (with NPC placeholders) if missing, and give active tenures a term end.
 * Ward data is regenerated from the world's own seed, so it matches what a fresh seed would create.
 */
export async function upgradeWorld(db: Db, seed: string, termMs: number): Promise<{ wardsAdded: number; termsSet: number }> {
  return db.transaction(async (tx) => {
    const ws = await tx.query<{ clock_epoch: Date }>('SELECT clock_epoch FROM world_state WHERE id = 1 FOR UPDATE');
    const epoch = new Date(ws.rows[0]?.clock_epoch ?? Date.now()).getTime();
    const termEndsAt = new Date(epoch + termMs);
    let wardsAdded = 0;
    const has = await tx.query('SELECT 1 FROM wards LIMIT 1');
    if (!has.rows.length) {
      const world = generateWorld(seed);
      const wardSeats = world.seats.filter((s) => s.wardId);
      const ids = new Set(wardSeats.map((s) => s.id));
      await insertWards(tx, world.wards);
      await insertSeatsWithNpcs(tx, wardSeats, world.npcs.filter((n) => ids.has(n.seatId)), termEndsAt);
      wardsAdded = world.wards.length;
      await tx.query(`INSERT INTO audit_log (action, target_type, target_id, details) VALUES ('world.upgraded', 'world', '1', $1::jsonb)`, [
        JSON.stringify({ wards: wardsAdded, wardSeats: wardSeats.length }),
      ]);
    }
    const t = await tx.query('UPDATE seat_tenures SET term_ends_at = $1 WHERE term_ends_at IS NULL AND ended_at IS NULL', [termEndsAt.toISOString()]);
    return { wardsAdded, termsSet: t.rowCount };
  });
}

export async function countWorld(db: Queryable): Promise<Record<string, number>> {
  const tables = ['states', 'lgas', 'senatorial_districts', 'federal_constituencies', 'wards', 'parties', 'seats', 'npcs', 'seat_tenures'];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`);
    counts[t] = r.rows[0]?.n ?? 0;
  }
  return counts;
}
