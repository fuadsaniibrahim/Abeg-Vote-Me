// Seats and offices. This module is the only code that writes seat_tenures: every change of holder goes
// through takeSeat / vacateSeat (or the term-expiry pass), each inside the caller's transaction, with the
// seat row locked so concurrent changes to one seat run one after another. A partial unique index is the
// last line of defence (one active tenure per seat, one active seat per holder), and a trigger writes an
// audit_log row for every tenure that starts or ends.
import { STATES } from '@avm/data';
import {
  Rng,
  SEAT_KIND_LABELS,
  activityStatus,
  checkEligibility,
  deputySeatOf,
  formatNaira,
  generateNpc,
  npcGovernorSecurity,
  npcLocalDecision,
  npcPresidentEconomy,
  pickLeaningParty,
  principalSeatOf,
  vacancyPlan,
  type EconomyInputs,
  type Eligibility,
  type InsecurityLevels,
  type NpcPersonality,
  type SeatKind,
  type SecurityPolicy,
  type UnitProfile,
  type VacancyPlan,
} from '@avm/engine';
import type { AppContext } from '../context.js';
import { termMs, type GameConfig } from '../config.js';
import type { Queryable } from '../db/index.js';
import { bad, conflict, credit, notFound } from './core.js';
import { publishNews } from './news.js';
import { deliver, notify, type NotificationRow } from './notify.js';
import { insertNpcs } from '../world/seed.js';

export type Holder = { type: 'player'; characterId: string } | { type: 'npc'; npcId: string };

/** How a holder got the seat. */
export type StartReason = 'election' | 'by_election' | 'succession' | 'appointed' | 'npc_returned' | 'npc_replaced' | 'takeover';
/** Why a holder lost the seat. */
export type EndReason = 'defeated' | 'resigned' | 'inactive' | 'removed' | 'succeeded' | 'replaced' | 'term_expired' | 'term_limited';

export interface Actor {
  userId?: string | null;
  characterId?: string | null;
}

export interface SeatRow {
  id: string;
  kind: SeatKind;
  name: string;
  state_code: string | null;
  district_id: string | null;
  constituency_id: string | null;
  lga_id: string | null;
  ward_id: string | null;
}

export interface TenureRow {
  id: number;
  seat_id: string;
  holder_type: 'npc' | 'player';
  character_id: string | null;
  npc_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
  start_reason: string;
  term_ends_at: Date | null;
  autopilot_since: Date | null;
  chief_of_staff_id: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Lets the audit trigger record who caused a tenure change (transaction-local). */
async function setActor(tx: Queryable, actor?: Actor): Promise<void> {
  await tx.query("SELECT set_config('avm.actor_user_id', $1, true), set_config('avm.actor_character_id', $2, true)", [actor?.userId ?? '', actor?.characterId ?? '']);
}

async function lockSeat(tx: Queryable, seatId: string): Promise<SeatRow> {
  const r = await tx.query<SeatRow>('SELECT id, kind, name, state_code, district_id, constituency_id, lga_id, ward_id FROM seats WHERE id = $1 FOR UPDATE', [seatId]);
  if (!r.rows[0]) throw notFound('No such seat.');
  return r.rows[0];
}

export async function activeTenure(db: Queryable, seatId: string): Promise<TenureRow | null> {
  const r = await db.query<TenureRow>('SELECT * FROM seat_tenures WHERE seat_id = $1 AND ended_at IS NULL', [seatId]);
  return r.rows[0] ?? null;
}

/** Terms a holder has served (or is serving) in offices of this kind. Every tenure counts as one term. */
export async function termsServed(db: Queryable, holder: Holder, kind: SeatKind): Promise<number> {
  const col = holder.type === 'player' ? 't.character_id' : 't.npc_id';
  const id = holder.type === 'player' ? holder.characterId : holder.npcId;
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE ${col} = $1 AND s.kind = $2`, [id, kind]);
  return r.rows[0]?.n ?? 0;
}

const DEFAULT_END: Record<StartReason, EndReason> = {
  election: 'defeated',
  by_election: 'defeated',
  succession: 'replaced',
  appointed: 'replaced',
  npc_returned: 'term_expired',
  npc_replaced: 'term_limited',
  takeover: 'replaced',
};

export interface TakeSeatOptions {
  seatId: string;
  holder: Holder;
  reason: StartReason;
  /** 'new' starts a full term; 'remainder' keeps the seat's current term end (by-elections, succession). */
  term: 'new' | 'remainder';
  /** Defaults by `reason` (an election winner "defeats" the previous holder). */
  endReason?: EndReason;
  actor?: Actor;
  nowMs?: number;
}

/**
 * Atomic seat takeover: lock the seat, end the current tenure (if any) and start the new one in the caller's
 * transaction. Refuses if the new holder already holds another seat, or (for elections) is term-limited.
 */
export async function takeSeat(tx: Queryable, game: GameConfig, o: TakeSeatOptions): Promise<{ tenureId: number; previous: TenureRow | null; seat: SeatRow }> {
  const now = o.nowMs ?? Date.now();
  await setActor(tx, o.actor);
  const seat = await lockSeat(tx, o.seatId);
  const cur = await activeTenure(tx, seat.id);
  const holderId = o.holder.type === 'player' ? o.holder.characterId : o.holder.npcId;
  if (cur && (cur.character_id ?? cur.npc_id) === holderId) throw conflict('already_holder', 'You already hold this seat.');

  const col = o.holder.type === 'player' ? 'character_id' : 'npc_id';
  const other = await tx.query<{ seat_id: string }>(`SELECT seat_id FROM seat_tenures WHERE ${col} = $1 AND ended_at IS NULL`, [holderId]);
  if (other.rows[0]) throw conflict('holds_other_seat', 'This person already holds another seat. They must leave it first.');

  if (o.reason === 'election' || o.reason === 'by_election') {
    const max = game.terms.maxTerms[seat.kind];
    if (max !== undefined && (await termsServed(tx, o.holder, seat.kind)) >= max) {
      throw bad('term_limit', `${SEAT_KIND_LABELS[seat.kind]} is limited to ${max} terms.`);
    }
  }

  let termEnds = now + termMs(game);
  if (o.term === 'remainder') {
    const last = await tx.query<{ term_ends_at: Date | null }>('SELECT term_ends_at FROM seat_tenures WHERE seat_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1', [seat.id]);
    const t = last.rows[0]?.term_ends_at;
    if (t) termEnds = new Date(t).getTime();
  }

  if (cur) {
    await tx.query('UPDATE seat_tenures SET ended_at = $2, end_reason = $3 WHERE id = $1', [cur.id, iso(now), o.endReason ?? DEFAULT_END[o.reason]]);
  }
  const ins = await tx.query<{ id: number }>(
    `INSERT INTO seat_tenures (seat_id, holder_type, character_id, npc_id, started_at, start_reason, term_ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [seat.id, o.holder.type, o.holder.type === 'player' ? holderId : null, o.holder.type === 'npc' ? holderId : null, iso(now), o.reason, iso(termEnds)],
  );
  if (o.reason === 'election' || o.reason === 'by_election') {
    await tx.query("UPDATE scheduled_elections SET status = 'completed', closed_at = $2 WHERE seat_id = $1 AND status = 'scheduled'", [seat.id, iso(now)]);
  }
  return { tenureId: (ins.rows[0] as { id: number }).id, previous: cur, seat };
}

/** Schedule an election for a seat unless one is already open. Returns the open election's id. */
export async function scheduleElection(tx: Queryable, seatId: string, kind: 'by_election' | 'general', reason: string, atMs: number): Promise<{ id: number; created: boolean }> {
  const ins = await tx.query<{ id: number }>(
    `INSERT INTO scheduled_elections (seat_id, kind, reason, scheduled_for) VALUES ($1, $2, $3, $4)
     ON CONFLICT (seat_id) WHERE status = 'scheduled' DO NOTHING RETURNING id`,
    [seatId, kind, reason, iso(atMs)],
  );
  if (ins.rows[0]) return { id: ins.rows[0].id, created: true };
  const r = await tx.query<{ id: number }>("SELECT id FROM scheduled_elections WHERE seat_id = $1 AND status = 'scheduled'", [seatId]);
  return { id: (r.rows[0] as { id: number }).id, created: false };
}

async function worldSeed(tx: Queryable): Promise<string> {
  const r = await tx.query<{ seed: string }>('SELECT seed FROM world_state WHERE id = 1');
  return r.rows[0]?.seed ?? 'world';
}

/** Party code of a seat's current holder (player's party, or NPC's party); null if none or no party. */
async function holderParty(tx: Queryable, t: TenureRow | null): Promise<string | null> {
  if (!t) return null;
  const r = t.character_id
    ? await tx.query<{ code: string }>('SELECT p.code FROM party_memberships m JOIN parties p ON p.id = m.party_id WHERE m.character_id = $1 AND m.left_at IS NULL', [t.character_id])
    : await tx.query<{ code: string }>('SELECT p.code FROM npcs n JOIN parties p ON p.id = n.party_id WHERE n.id = $1', [t.npc_id]);
  return r.rows[0]?.code ?? null;
}

/** Create a new NPC for `seat` (party given, or drawn from local leanings) and seat them. */
async function seatNewNpc(
  tx: Queryable,
  game: GameConfig,
  seat: SeatRow,
  partyCode: string | null,
  o: { reason: StartReason; term: 'new' | 'remainder'; nowMs: number; endReason?: EndReason; actor?: Actor },
): Promise<{ npcId: string; name: string; partyCode: string }> {
  const seed = await worldSeed(tx);
  const serial = ((await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM npcs WHERE id LIKE $1", [`npc-${seat.id}-%`])).rows[0]?.n ?? 0) + 1;
  const rng = new Rng(`${seed}/npc/${seat.id}/${serial}`);
  const nonFct = STATES.filter((s) => !s.isFct);
  const stateCode = seat.state_code ?? rng.pick(nonFct).code;
  const state = STATES.find((s) => s.code === stateCode) ?? rng.pick(nonFct);
  let party = partyCode && partyCode !== 'IND' ? partyCode : null;
  if (!party) {
    const prof = await tx.query<{ profile: UnitProfile }>('SELECT profile FROM states WHERE code = $1', [state.code]);
    party = pickLeaningParty(rng, (prof.rows[0] as { profile: UnitProfile }).profile.leanings);
  }
  const npc = generateNpc(rng, { seatId: seat.id, kind: seat.kind, stateCode: state.code, zone: state.zone, partyCode: party, serial });
  await insertNpcs(tx, [npc]);
  await takeSeat(tx, game, { seatId: seat.id, holder: { type: 'npc', npcId: npc.id }, ...o });
  return { npcId: npc.id, name: npc.name, partyCode: party };
}

/** Name of a tenure's holder. */
async function holderName(tx: Queryable, t: TenureRow): Promise<string> {
  const r = t.character_id
    ? await tx.query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [t.character_id])
    : await tx.query<{ name: string }>('SELECT name FROM npcs WHERE id = $1', [t.npc_id]);
  return r.rows[0]?.name ?? 'Unknown';
}

export interface VacancyOutcome {
  plan: VacancyPlan;
  /** Who stepped up (succession) or was appointed. */
  successor: { name: string; seatId: string; type: 'player' | 'npc' } | null;
  electionId: number | null;
  notifications: NotificationRow[];
}

/**
 * End the current holder's tenure and fill the gap: the deputy succeeds a President or Governor (and a new
 * deputy is appointed), a deputy seat is filled by appointment, and any other seat goes to a by-election.
 * Notifications are returned for delivery after commit.
 */
export async function vacateSeat(tx: Queryable, game: GameConfig, seatId: string, reason: Extract<EndReason, 'resigned' | 'inactive' | 'removed'>, opts: { actor?: Actor; nowMs?: number } = {}): Promise<VacancyOutcome> {
  const now = opts.nowMs ?? Date.now();
  await setActor(tx, opts.actor);
  const seat = await lockSeat(tx, seatId);
  const cur = await activeTenure(tx, seat.id);
  if (!cur) throw conflict('already_vacant', 'This seat is already vacant.');
  const leaverName = await holderName(tx, cur);
  await tx.query('UPDATE seat_tenures SET ended_at = $2, end_reason = $3 WHERE id = $1', [cur.id, iso(now), reason]);

  const notes: NotificationRow[] = [];
  const stateName = STATES.find((s) => s.code === seat.state_code)?.name ?? 'Nigeria';
  const newsKind = reason === 'inactive' ? 'seat_vacated_inactive' : 'seat_resigned';
  await publishNews(tx, { kind: newsKind, vars: { name: leaverName, seat: seat.name }, source: cur.character_id ? 'player' : 'world', stateCode: seat.state_code, actorId: cur.character_id });

  const deputyId = deputySeatOf(seat.id);
  const deputySeat = deputyId ? await lockSeat(tx, deputyId) : null;
  const deputy = deputyId ? await activeTenure(tx, deputyId) : null;
  const plan = vacancyPlan(seat.id, !!deputy);
  const office = SEAT_KIND_LABELS[seat.kind];

  if (plan === 'succession' && deputy && deputySeat) {
    // the deputy moves up for the rest of the term; their old seat is then filled by appointment
    const name = await holderName(tx, deputy);
    await tx.query("UPDATE seat_tenures SET ended_at = $2, end_reason = 'succeeded' WHERE id = $1", [deputy.id, iso(now)]);
    const holder: Holder = deputy.character_id ? { type: 'player', characterId: deputy.character_id } : { type: 'npc', npcId: deputy.npc_id as string };
    await takeSeat(tx, game, { seatId: seat.id, holder, reason: 'succession', term: 'remainder', nowMs: now, actor: opts.actor });
    await publishNews(tx, { kind: 'succession', vars: { name, office, state: stateName }, source: 'world', stateCode: seat.state_code, actorId: deputy.character_id });
    if (deputy.character_id) notes.push(await notify(tx, deputy.character_id, 'office_succession', `You are now ${seat.name}`, `${leaverName} left office. You serve the rest of the term.`));
    const party = await holderParty(tx, await activeTenure(tx, seat.id));
    const appointed = await seatNewNpc(tx, game, deputySeat, party, { reason: 'appointed', term: 'remainder', nowMs: now, actor: opts.actor });
    await publishNews(tx, { kind: 'deputy_appointed', vars: { name: appointed.name, office: SEAT_KIND_LABELS[deputySeat.kind] }, source: 'world', stateCode: seat.state_code });
    return { plan, successor: { name, seatId: seat.id, type: holder.type }, electionId: null, notifications: notes };
  }

  if (plan === 'appoint') {
    const principal = await activeTenure(tx, principalSeatOf(seat.id) as string);
    const appointed = await seatNewNpc(tx, game, seat, await holderParty(tx, principal), { reason: 'appointed', term: 'remainder', nowMs: now, actor: opts.actor });
    await publishNews(tx, { kind: 'deputy_appointed', vars: { name: appointed.name, office }, source: 'world', stateCode: seat.state_code });
    return { plan, successor: { name: appointed.name, seatId: seat.id, type: 'npc' }, electionId: null, notifications: notes };
  }

  const election = await scheduleElection(tx, seat.id, 'by_election', reason, now + game.offices.byElectionDelayHours * 3_600_000);
  await publishNews(tx, { kind: 'by_election_scheduled', vars: { seat: seat.name }, source: 'world', stateCode: seat.state_code });
  return { plan, successor: null, electionId: election.id, notifications: notes };
}

// ---------- term expiry ----------

export interface TermReport {
  npcReturned: number;
  npcReplaced: number;
  generalScheduled: number;
}

const LIMITED_PRINCIPALS = ['PRESIDENT', 'GOVERNOR'];

/**
 * Handle every tenure whose term has ended. Until elections exist (Phase 5):
 *  - a player holder stays on ("holding over") and a general election is scheduled for the seat;
 *  - an NPC is returned for another term, unless the office is term-limited and they have served the
 *    maximum, in which case a fresh NPC (party drawn from local leanings) takes over with a fresh deputy.
 */
export async function processExpiredTerms(tx: Queryable, game: GameConfig, nowMs: number): Promise<{ report: TermReport; notifications: NotificationRow[] }> {
  await setActor(tx);
  const report: TermReport = { npcReturned: 0, npcReplaced: 0, generalScheduled: 0 };
  const notes: NotificationRow[] = [];

  // players: hold over and schedule a general election
  const players = await tx.query<{ seat_id: string; character_id: string; name: string }>(
    `SELECT t.seat_id, t.character_id, s.name FROM seat_tenures t JOIN seats s ON s.id = t.seat_id
     WHERE t.ended_at IS NULL AND t.holder_type = 'player' AND t.term_ends_at <= $1 ORDER BY t.seat_id`,
    [iso(nowMs)],
  );
  for (const p of players.rows) {
    const e = await scheduleElection(tx, p.seat_id, 'general', 'term_expired', nowMs);
    if (e.created) {
      report.generalScheduled++;
      notes.push(await notify(tx, p.character_id, 'term_expired', `Your term as ${p.name} has ended`, 'You hold over until the next election for the seat.'));
    }
  }

  // term-limited NPC principals (President, Governors) one by one, with their deputies
  const handled = new Set<string>();
  const principals = await tx.query<{ seat_id: string; kind: SeatKind; npc_id: string }>(
    `SELECT t.seat_id, s.kind, t.npc_id FROM seat_tenures t JOIN seats s ON s.id = t.seat_id
     WHERE t.ended_at IS NULL AND t.holder_type = 'npc' AND t.term_ends_at <= $1 AND s.kind = ANY($2) ORDER BY t.seat_id`,
    [iso(nowMs), LIMITED_PRINCIPALS],
  );
  for (const p of principals.rows) {
    const max = game.terms.maxTerms[p.kind];
    if (max === undefined || (await termsServed(tx, { type: 'npc', npcId: p.npc_id }, p.kind)) < max) continue;
    const seat = await lockSeat(tx, p.seat_id);
    const fresh = await seatNewNpc(tx, game, seat, null, { reason: 'npc_replaced', term: 'new', nowMs });
    handled.add(seat.id);
    report.npcReplaced++;
    const stateName = STATES.find((s) => s.code === seat.state_code)?.name ?? 'Nigeria';
    await publishNews(tx, { kind: 'npc_replaced', vars: { name: fresh.name, office: SEAT_KIND_LABELS[seat.kind], state: stateName }, source: 'world', stateCode: seat.state_code });
    const depId = deputySeatOf(seat.id) as string;
    const dep = await activeTenure(tx, depId);
    if (dep?.holder_type === 'npc') {
      // the new principal brings a new deputy on the same (new) term
      await seatNewNpc(tx, game, await lockSeat(tx, depId), fresh.partyCode, { reason: 'npc_replaced', term: 'new', nowMs, endReason: 'replaced' });
      handled.add(depId);
      report.npcReplaced++;
    }
  }

  // every other expired NPC tenure: same NPC, next term (kept on the seat's cycle)
  const ended = await tx.query<{ seat_id: string; npc_id: string; term_ends_at: Date }>(
    `UPDATE seat_tenures SET ended_at = $1, end_reason = 'term_expired'
     WHERE ended_at IS NULL AND holder_type = 'npc' AND term_ends_at <= $1 AND NOT (seat_id = ANY($2))
     RETURNING seat_id, npc_id, term_ends_at`,
    [iso(nowMs), [...handled]],
  );
  if (ended.rows.length) {
    const term = termMs(game);
    await tx.query(
      `INSERT INTO seat_tenures (seat_id, holder_type, npc_id, started_at, start_reason, term_ends_at)
       SELECT x.seat_id, 'npc', x.npc_id, $2, 'npc_returned', x.term_ends_at
       FROM jsonb_to_recordset($1::jsonb) AS x(seat_id text, npc_id text, term_ends_at timestamptz)`,
      [JSON.stringify(ended.rows.map((r) => ({ seat_id: r.seat_id, npc_id: r.npc_id, term_ends_at: iso(new Date(r.term_ends_at).getTime() + term) }))), iso(nowMs)],
    );
    report.npcReturned = ended.rows.length;
  }
  return { report, notifications: notes };
}

// ---------- inactivity ----------

export interface InactivityReport {
  autopilot: number;
  resumed: number;
  vacated: number;
}

/** Player holders who stop playing go on autopilot, then lose the seat (config `inactivity`). */
export async function processInactivity(tx: Queryable, game: GameConfig, nowMs: number): Promise<{ report: InactivityReport; notifications: NotificationRow[] }> {
  const report: InactivityReport = { autopilot: 0, resumed: 0, vacated: 0 };
  const notes: NotificationRow[] = [];
  const rows = await tx.query<{ seat_id: string; seat_name: string; tenure_id: number; character_id: string; user_id: string; last_active_at: Date; autopilot_since: Date | null; chief_of_staff_id: string | null }>(
    `SELECT t.seat_id, s.name AS seat_name, t.id AS tenure_id, t.character_id, c.user_id, c.last_active_at, t.autopilot_since, t.chief_of_staff_id
     FROM seat_tenures t JOIN seats s ON s.id = t.seat_id JOIN characters c ON c.id = t.character_id
     WHERE t.ended_at IS NULL AND t.holder_type = 'player' ORDER BY t.seat_id`,
  );
  for (const r of rows.rows) {
    const status = activityStatus(new Date(r.last_active_at).getTime(), nowMs, game.inactivity);
    if (status === 'vacate') {
      const out = await vacateSeat(tx, game, r.seat_id, 'inactive', { nowMs });
      notes.push(...out.notifications);
      notes.push(await notify(tx, r.character_id, 'seat_lost_inactive', `You lost your seat as ${r.seat_name}`, `You were away for ${game.inactivity.vacancyAfterDays} days.`));
      report.vacated++;
    } else if (status === 'autopilot' && !r.autopilot_since) {
      await tx.query('UPDATE seat_tenures SET autopilot_since = $2 WHERE id = $1', [r.tenure_id, iso(nowMs)]);
      notes.push(
        await notify(tx, r.character_id, 'autopilot', `Your office is on autopilot`, `Come back within ${game.inactivity.vacancyAfterDays - game.inactivity.autopilotAfterDays} days or you will lose your seat.`),
      );
      if (r.chief_of_staff_id) notes.push(await notify(tx, r.chief_of_staff_id, 'acting_for', `You are now acting for the ${r.seat_name}`, 'The office holder is away.'));
      report.autopilot++;
    } else if (status === 'active' && r.autopilot_since) {
      await tx.query('UPDATE seat_tenures SET autopilot_since = NULL WHERE id = $1', [r.tenure_id]);
      report.resumed++;
    }
  }
  return { report, notifications: notes };
}

/** Name (or clear, with null) the player who acts for this tenure's holder while they are away. */
export async function setChiefOfStaff(tx: Queryable, tenureId: number, characterId: string | null): Promise<void> {
  await tx.query('UPDATE seat_tenures SET chief_of_staff_id = $2 WHERE id = $1 AND ended_at IS NULL', [tenureId, characterId]);
}

/** Called on authenticated requests: marks the player active (at most once a minute) and ends autopilot. */
export async function touchActivity(db: Queryable, userId: string): Promise<void> {
  const r = await db.query<{ id: string }>("UPDATE characters SET last_active_at = now() WHERE user_id = $1 AND last_active_at < now() - interval '1 minute' RETURNING id", [userId]);
  const id = r.rows[0]?.id;
  if (id) await db.query('UPDATE seat_tenures SET autopilot_since = NULL WHERE character_id = $1 AND ended_at IS NULL AND autopilot_since IS NOT NULL', [id]);
}

/** Inactivity and term expiry in one transaction; notifications delivered after commit. */
export async function runSeatMaintenance(ctx: AppContext, nowMs = Date.now()): Promise<{ inactivity: InactivityReport; terms: TermReport }> {
  const out = await ctx.db.transaction(async (tx) => {
    const a = await processInactivity(tx, ctx.game, nowMs);
    const b = await processExpiredTerms(tx, ctx.game, nowMs);
    return { inactivity: a.report, terms: b.report, notes: [...a.notifications, ...b.notifications] };
  });
  deliver(ctx.realtime, out.notes);
  return { inactivity: out.inactivity, terms: out.terms };
}

// ---------- world tick: NPC decisions and salaries ----------

export interface NpcDecisionRow {
  npcId: string;
  seatId: string;
  decision: string;
  details: Record<string, unknown>;
}

export interface OfficeDecisions {
  /** State code → security policy set by an NPC governor. States without one use the neutral policy. */
  security: Record<string, SecurityPolicy>;
  /** Set when the President is an NPC. */
  economy: Pick<EconomyInputs, 'corruption' | 'spending'> | null;
  rows: NpcDecisionRow[];
}

/**
 * What NPC office holders decide this month (deterministic per seed and turn): governors set state security
 * policy, the President sets corruption and spending, LG chairmen may run a project or divert funds.
 * Read-only; the caller stores `rows` once the tick is claimed.
 */
export async function npcOfficeDecisions(tx: Queryable, seed: string, turn: number, insecurity: Record<string, InsecurityLevels>): Promise<OfficeDecisions> {
  const r = await tx.query<{ seat_id: string; kind: SeatKind; state_code: string | null; npc_id: string; personality: NpcPersonality }>(
    `SELECT t.seat_id, s.kind, s.state_code, n.id AS npc_id, n.personality
     FROM seat_tenures t JOIN seats s ON s.id = t.seat_id JOIN npcs n ON n.id = t.npc_id
     WHERE t.ended_at IS NULL AND s.kind IN ('PRESIDENT', 'GOVERNOR', 'LG_CHAIRMAN') ORDER BY t.seat_id`,
  );
  const out: OfficeDecisions = { security: {}, economy: null, rows: [] };
  for (const h of r.rows) {
    const rng = new Rng(`${seed}/turn:${turn}/office:${h.seat_id}`);
    if (h.kind === 'GOVERNOR' && h.state_code && insecurity[h.state_code]) {
      const d = npcGovernorSecurity(h.personality, insecurity[h.state_code] as InsecurityLevels, rng);
      out.security[h.state_code] = d.policy;
      out.rows.push({ npcId: h.npc_id, seatId: h.seat_id, decision: d.decision, details: { securityBudget: d.policy.securityBudget, diversion: d.policy.diversion } });
    } else if (h.kind === 'PRESIDENT') {
      const d = npcPresidentEconomy(h.personality, rng);
      out.economy = d.inputs;
      out.rows.push({ npcId: h.npc_id, seatId: h.seat_id, decision: d.decision, details: d.inputs });
    } else if (h.kind === 'LG_CHAIRMAN') {
      const d = npcLocalDecision(h.personality, rng);
      if (d !== 'none') out.rows.push({ npcId: h.npc_id, seatId: h.seat_id, decision: d, details: {} });
    }
  }
  return out;
}

/** Store decisions and publish at most one LG project and one governor security push headline per turn. */
export async function recordNpcDecisions(tx: Queryable, turn: number, d: OfficeDecisions, rng: Rng): Promise<void> {
  if (!d.rows.length) return;
  await tx.query(
    `INSERT INTO npc_decisions (turn, npc_id, seat_id, decision, details)
     SELECT $2, x.npc_id, x.seat_id, x.decision, x.details FROM jsonb_to_recordset($1::jsonb) AS x(npc_id text, seat_id text, decision text, details jsonb)`,
    [JSON.stringify(d.rows.map((r) => ({ npc_id: r.npcId, seat_id: r.seatId, decision: r.decision, details: r.details }))), turn],
  );
  const headline = async (decision: string, kind: string) => {
    const picks = d.rows.filter((r) => r.decision === decision);
    if (!picks.length) return;
    const pick = rng.pick(picks);
    const info = await tx.query<{ name: string; state_code: string; lga_name: string | null }>(
      'SELECT n.name, s.state_code, l.name AS lga_name FROM npcs n JOIN seats s ON s.id = $2 LEFT JOIN lgas l ON l.id = s.lga_id WHERE n.id = $1',
      [pick.npcId, pick.seatId],
    );
    const i = info.rows[0];
    if (!i) return;
    const state = STATES.find((s) => s.code === i.state_code)?.name ?? i.state_code;
    await publishNews(tx, { kind, vars: { name: i.name, state, lga: i.lga_name ?? state }, source: 'world', stateCode: i.state_code, gameTurn: turn }, rng);
  };
  await headline('project', 'lg_project');
  await headline('security_push', 'governor_security');
}

/** Monthly salary for every player holding a seat. Returns notifications for delivery after commit. */
export async function payOfficeSalaries(tx: Queryable, game: GameConfig): Promise<{ paid: number; total: number; notifications: NotificationRow[] }> {
  const r = await tx.query<{ seat_id: string; kind: SeatKind; name: string; character_id: string }>(
    `SELECT t.seat_id, s.kind, s.name, t.character_id FROM seat_tenures t JOIN seats s ON s.id = t.seat_id
     WHERE t.ended_at IS NULL AND t.holder_type = 'player' ORDER BY t.seat_id`,
  );
  const notes: NotificationRow[] = [];
  let total = 0;
  let paid = 0;
  for (const h of r.rows) {
    const amount = game.offices.monthlySalary[h.kind] ?? 0;
    if (amount <= 0) continue;
    await credit(tx, h.character_id, 'wallet', amount, 'office_salary', { type: 'seat', id: h.seat_id });
    notes.push(await notify(tx, h.character_id, 'office_salary', `Salary paid: ${formatNaira(amount)}`, h.name));
    total += amount;
    paid++;
  }
  return { paid, total, notifications: notes };
}

// ---------- eligibility ----------

/** Can this character hold (run for) this seat? Uses config office rules and term limits. */
export async function eligibilityFor(db: Queryable, game: GameConfig, characterId: string, seat: SeatRow): Promise<Eligibility> {
  const c = await db.query<{ age: number; home_state_code: string; home_lga_id: string }>('SELECT age, home_state_code, home_lga_id FROM characters WHERE id = $1', [characterId]);
  const ch = c.rows[0];
  if (!ch) throw notFound('Character not found.');
  const party = await db.query<{ code: string; joined_at: Date }>(
    'SELECT p.code, m.joined_at FROM party_memberships m JOIN parties p ON p.id = m.party_id WHERE m.character_id = $1 AND m.left_at IS NULL',
    [characterId],
  );
  const past = await db.query<{ kind: SeatKind }>('SELECT DISTINCT s.kind FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE t.character_id = $1', [characterId]);
  const p = party.rows[0];
  return checkEligibility(
    {
      age: ch.age,
      homeStateCode: ch.home_state_code,
      homeLgaId: ch.home_lga_id,
      partyCode: p?.code ?? null,
      partyDays: p ? Math.floor((Date.now() - new Date(p.joined_at).getTime()) / 86_400_000) : 0,
      pastOffices: past.rows.map((r) => r.kind),
      termsServed: await termsServed(db, { type: 'player', characterId }, seat.kind),
    },
    { kind: seat.kind, stateCode: seat.state_code, lgaId: seat.lga_id },
    game.offices.eligibility,
    { minPartyDays: game.offices.minPartyDays, maxTerms: game.terms.maxTerms },
  );
}
