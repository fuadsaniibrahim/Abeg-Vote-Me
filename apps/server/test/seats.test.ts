import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { termMs } from '../src/config.js';
import { runOneTick } from '../src/game/tick.js';
import { runSeatMaintenance, takeSeat, vacateSeat, type StartReason, type TenureRow } from '../src/game/seats.js';
import { createTestContext } from './helpers.js';
import { makePlayer, walletOf, type TestPlayer } from './players.js';

let ctx: AppContext;
let app: FastifyInstance;
const DAY = 86_400_000;

beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 10_000 } };
  app = await buildApp(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.db.close();
});

const give = (seatId: string, characterId: string, reason: StartReason = 'takeover', term: 'new' | 'remainder' = 'new') =>
  ctx.db.transaction((tx) => takeSeat(tx, ctx.game, { seatId, holder: { type: 'player', characterId }, reason, term }));

const tenures = async (seatId: string) =>
  (await ctx.db.query<TenureRow>('SELECT * FROM seat_tenures WHERE seat_id = $1 ORDER BY started_at, id', [seatId])).rows;
const active = async (seatId: string) => (await tenures(seatId)).filter((t) => !t.ended_at);
const openElection = async (seatId: string) =>
  (await ctx.db.query<{ id: number; kind: string; reason: string; scheduled_for: Date }>("SELECT * FROM scheduled_elections WHERE seat_id = $1 AND status = 'scheduled'", [seatId])).rows;
const notes = async (p: TestPlayer) => (await p.call('GET', '/api/notifications')).body.notifications as { kind: string; title: string }[];
const audits = async (seatId: string) =>
  (await ctx.db.query<{ action: string; actor_character_id: string | null; details: Record<string, unknown> }>("SELECT action, actor_character_id, details FROM audit_log WHERE target_type = 'seat' AND target_id = $1 AND action LIKE 'tenure.%' ORDER BY id", [seatId])).rows;

describe('seat takeover', () => {
  it('a player takes a seat from its NPC placeholder atomically; the NPC is unseated', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'LA', homeLgaId: 'LA-011' });
    const [npcTenure] = await active('LGC-LA-011');
    expect(npcTenure).toMatchObject({ holder_type: 'npc', npc_id: 'npc-LGC-LA-011' });

    const r = await give('LGC-LA-011', p.characterId, 'election');
    const all = await tenures('LGC-LA-011');
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ npc_id: 'npc-LGC-LA-011', end_reason: 'defeated' });
    expect(all[1]).toMatchObject({ id: r.tenureId, holder_type: 'player', character_id: p.characterId, start_reason: 'election', ended_at: null });
    // the handover has no gap and no overlap
    expect(new Date(all[0]!.ended_at!).getTime()).toBe(new Date(all[1]!.started_at).getTime());
    // the NPC still exists but holds nothing
    const npc = await ctx.db.query("SELECT 1 FROM seat_tenures WHERE npc_id = 'npc-LGC-LA-011' AND ended_at IS NULL");
    expect(npc.rows).toHaveLength(0);
    expect((await ctx.db.query("SELECT 1 FROM npcs WHERE id = 'npc-LGC-LA-011'")).rows).toHaveLength(1);

    const seat = (await app.inject({ method: 'GET', url: '/api/seats/LGC-LA-011' })).json();
    expect(seat.seat.holder).toMatchObject({ type: 'player', id: p.characterId, name: p.name });
    const me = (await p.call('GET', '/api/me/character')).body.character;
    expect(me.office).toMatchObject({ id: 'LGC-LA-011', kind: 'LG_CHAIRMAN', autopilot: false, monthlySalary: 450_000 });
  });

  it('a takeover that fails part-way leaves the seat exactly as it was', async () => {
    const p = await makePlayer(app, ctx);
    const before = await tenures('LGC-LA-012');
    await expect(
      ctx.db.transaction(async (tx) => {
        await takeSeat(tx, ctx.game, { seatId: 'LGC-LA-012', holder: { type: 'player', characterId: p.characterId }, reason: 'takeover', term: 'new' });
        throw new Error('crash after takeover');
      }),
    ).rejects.toThrow('crash after takeover');
    expect(await tenures('LGC-LA-012')).toEqual(before);
  });

  it('refuses a holder who already holds another seat, and an unknown seat', async () => {
    const p = await makePlayer(app, ctx);
    await give('LGC-LA-013', p.characterId);
    await expect(give('LGC-LA-014', p.characterId)).rejects.toMatchObject({ code: 'holds_other_seat' });
    await expect(give('LGC-LA-013', p.characterId)).rejects.toMatchObject({ code: 'already_holder' });
    await expect(give('NOPE', p.characterId)).rejects.toMatchObject({ code: 'not_found' });
    expect((await active('LGC-LA-014'))[0]?.holder_type).toBe('npc');
  });

  it('concurrent takeover attempts cannot produce two holders', async () => {
    const players = await Promise.all(Array.from({ length: 8 }, () => makePlayer(app, ctx)));
    const results = await Promise.allSettled(players.map((p) => give('LGC-LA-015', p.characterId)));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const all = await tenures('LGC-LA-015');
    expect(all.filter((t) => !t.ended_at)).toHaveLength(1);
    expect(all).toHaveLength(9); // NPC + 8 players, each replacing the last
    // tenures form one chain: each ends exactly when the next starts
    for (let i = 1; i < all.length; i++) expect(new Date(all[i - 1]!.ended_at!).getTime()).toBeLessThanOrEqual(new Date(all[i]!.started_at).getTime());

    // the same player racing for two seats gets at most one
    const q = await makePlayer(app, ctx);
    const race = await Promise.allSettled([give('LGC-LA-016', q.characterId), give('LGC-LA-017', q.characterId)]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(race.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'holds_other_seat' } });
    const held = await ctx.db.query('SELECT seat_id FROM seat_tenures WHERE character_id = $1 AND ended_at IS NULL', [q.characterId]);
    expect(held.rows).toHaveLength(1);

    // the database itself rejects a second active tenure even if application checks are bypassed
    await expect(ctx.db.query("INSERT INTO seat_tenures (seat_id, holder_type, npc_id, start_reason) VALUES ('LGC-LA-015', 'npc', 'npc-LGC-LA-015', 'takeover')")).rejects.toThrow(
      /seat_tenures_one_active_per_seat/,
    );
  });
});

describe('vacancies, by-elections and succession', () => {
  it('resigning ends the tenure, leaves the seat vacant and schedules a by-election', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'KN', homeLgaId: 'KN-001' });
    await give('LGC-KN-001', p.characterId);
    expect((await p.call('POST', '/api/office/resign', {})).body.error).toBe('confirm_required');
    const res = await p.call('POST', '/api/office/resign', { confirm: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, seatId: 'LGC-KN-001', plan: 'by_election', successor: null });

    expect(await active('LGC-KN-001')).toHaveLength(0);
    expect((await tenures('LGC-KN-001')).at(-1)).toMatchObject({ character_id: p.characterId, end_reason: 'resigned' });
    const [e] = await openElection('LGC-KN-001');
    expect(e).toMatchObject({ id: res.body.electionId, kind: 'by_election', reason: 'resigned' });
    const delay = new Date(e!.scheduled_for).getTime() - Date.now();
    expect(delay).toBeGreaterThan((ctx.game.offices.byElectionDelayHours - 0.1) * 3_600_000);
    expect(delay).toBeLessThanOrEqual(ctx.game.offices.byElectionDelayHours * 3_600_000);

    const seat = (await app.inject({ method: 'GET', url: '/api/seats/LGC-KN-001' })).json();
    expect(seat.seat.holder).toBeNull();
    expect(seat.openElection).toMatchObject({ kind: 'by_election' });
    expect((await p.call('GET', '/api/me/character')).body.character.office).toBeNull();
    expect((await p.call('POST', '/api/office/resign', { confirm: true })).body.error).toBe('no_office');
    const news = await ctx.db.query<{ kind: string }>("SELECT kind FROM news_items WHERE kind IN ('seat_resigned', 'by_election_scheduled')");
    expect(news.rows.map((n) => n.kind).sort()).toEqual(['by_election_scheduled', 'seat_resigned']);

    // the by-election winner serves the rest of the term and closes the scheduled election
    const winner = await makePlayer(app, ctx, { homeStateCode: 'KN', homeLgaId: 'KN-001' });
    await give('LGC-KN-001', winner.characterId, 'by_election', 'remainder');
    const t = await tenures('LGC-KN-001');
    expect(t.at(-1)!.term_ends_at).toEqual(t.at(-2)!.term_ends_at);
    expect(await openElection('LGC-KN-001')).toHaveLength(0);
    // a vacancy never schedules two elections for one seat
    const out = await ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'LGC-KN-001', 'removed'));
    const again = await ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'LGC-KN-002', 'removed'));
    expect(out.electionId).not.toBe(again.electionId);
    await expect(ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'LGC-KN-001', 'removed'))).rejects.toMatchObject({ code: 'already_vacant' });
  });

  it('when a governor leaves, the deputy (a player) succeeds for the rest of the term and a new deputy is appointed', async () => {
    const dep = await makePlayer(app, ctx, { homeStateCode: 'OY', homeLgaId: 'OY-001' });
    await dep.call('POST', '/api/parties/PRM/join');
    await give('DGOV-OY', dep.characterId);
    const [gov] = await active('GOV-OY');

    const out = await ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'GOV-OY', 'removed'));
    expect(out).toMatchObject({ plan: 'succession', successor: { seatId: 'GOV-OY', type: 'player', name: dep.name }, electionId: null });

    const [now] = await active('GOV-OY');
    expect(now).toMatchObject({ character_id: dep.characterId, start_reason: 'succession' });
    expect(now!.term_ends_at).toEqual(gov!.term_ends_at);
    expect((await tenures('DGOV-OY')).find((t) => t.character_id === dep.characterId)).toMatchObject({ end_reason: 'succeeded' });

    const [newDep] = await active('DGOV-OY');
    expect(newDep).toMatchObject({ holder_type: 'npc', start_reason: 'appointed' });
    const party = await ctx.db.query<{ code: string; state_code: string }>('SELECT p.code, n.state_code FROM npcs n JOIN parties p ON p.id = n.party_id WHERE n.id = $1', [newDep!.npc_id]);
    expect(party.rows[0]).toEqual({ code: 'PRM', state_code: 'OY' }); // the new governor's party and state
    expect(await openElection('GOV-OY')).toHaveLength(0);
    expect((await notes(dep)).some((n) => n.kind === 'office_succession')).toBe(true);

    const detail = (await app.inject({ method: 'GET', url: '/api/seats/GOV-OY' })).json();
    expect(detail.deputy.holder).toMatchObject({ type: 'npc', startReason: 'appointed' });
  });

  it('the Vice President succeeds the President; a governor seat with no deputy goes to a by-election', async () => {
    const [vp] = await active('VP');
    const out = await ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'PRES', 'removed'));
    expect(out.plan).toBe('succession');
    expect((await active('PRES'))[0]).toMatchObject({ npc_id: vp!.npc_id, start_reason: 'succession' });
    expect((await active('VP'))[0]).toMatchObject({ start_reason: 'appointed' });

    // deputy leaves first (appointment), then remove the appointee too and vacate the governor seat
    await ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'DGOV-EK', 'resigned'));
    expect((await active('DGOV-EK'))[0]).toMatchObject({ start_reason: 'appointed' });
    await ctx.db.exec("UPDATE seat_tenures SET ended_at = now(), end_reason = 'removed' WHERE seat_id = 'DGOV-EK' AND ended_at IS NULL");
    const gov = await ctx.db.transaction((tx) => vacateSeat(tx, ctx.game, 'GOV-EK', 'removed'));
    expect(gov.plan).toBe('by_election');
    expect(await openElection('GOV-EK')).toHaveLength(1);
  });
});

describe('terms and term limits', () => {
  it('records term start and end; a player whose term ends holds over and a general election is scheduled', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'EN', homeLgaId: 'EN-001' });
    await give('LGC-EN-001', p.characterId);
    const [t] = await active('LGC-EN-001');
    expect(new Date(t!.term_ends_at!).getTime() - new Date(t!.started_at).getTime()).toBe(termMs(ctx.game));

    await runSeatMaintenance(ctx);
    expect(await openElection('LGC-EN-001')).toHaveLength(0);
    // (time is moved by moving the term end, not the clock: a later clock would also make every player inactive)
    await ctx.db.query("UPDATE seat_tenures SET term_ends_at = now() - interval '1 second' WHERE id = $1", [t!.id]);
    const rep = await runSeatMaintenance(ctx);
    expect(rep.terms.generalScheduled).toBe(1);
    expect(await openElection('LGC-EN-001')).toMatchObject([{ kind: 'general', reason: 'term_expired' }]);
    expect((await active('LGC-EN-001'))[0]).toMatchObject({ character_id: p.characterId });
    expect((await notes(p)).filter((n) => n.kind === 'term_expired')).toHaveLength(1);
    // running again does not schedule or notify twice
    await runSeatMaintenance(ctx);
    const detail = (await app.inject({ method: 'GET', url: '/api/seats/LGC-EN-001' })).json();
    expect(detail.seat.holder).toMatchObject({ id: p.characterId, holdingOver: true });
    expect(detail.openElection).toMatchObject({ kind: 'general' });
    expect((await notes(p)).filter((n) => n.kind === 'term_expired')).toHaveLength(1);
    expect((await ctx.db.query("SELECT 1 FROM scheduled_elections WHERE seat_id = 'LGC-EN-001'")).rows).toHaveLength(1);
  });

  it('an NPC whose term ends is returned for a new term on the same cycle', async () => {
    const [t] = await active('SEN-EN-SD1');
    const past = Date.now() - 1000;
    await ctx.db.query('UPDATE seat_tenures SET term_ends_at = $2 WHERE id = $1', [t!.id, new Date(past).toISOString()]);
    const rep = await runSeatMaintenance(ctx);
    expect(rep.terms.npcReturned).toBeGreaterThanOrEqual(1);
    const all = await tenures('SEN-EN-SD1');
    expect(all.at(-2)).toMatchObject({ id: t!.id, end_reason: 'term_expired' });
    expect(all.at(-1)).toMatchObject({ npc_id: t!.npc_id, start_reason: 'npc_returned', ended_at: null });
    expect(new Date(all.at(-1)!.term_ends_at!).getTime()).toBe(past + termMs(ctx.game));
  });

  it('Governor and President are limited to 2 terms: an NPC governor is replaced after two, with a new deputy', async () => {
    const expire = async (seatId: string) => {
      await ctx.db.query("UPDATE seat_tenures SET term_ends_at = now() - interval '1 second' WHERE seat_id = $1 AND ended_at IS NULL", [seatId]);
      await runSeatMaintenance(ctx);
    };
    const [first] = await active('GOV-KN');
    await expire('GOV-KN');
    expect((await active('GOV-KN'))[0]).toMatchObject({ npc_id: first!.npc_id, start_reason: 'npc_returned' }); // second term
    const [dep] = await active('DGOV-KN');
    await expire('GOV-KN');
    const [fresh] = await active('GOV-KN');
    expect(fresh).toMatchObject({ start_reason: 'npc_replaced' });
    expect(fresh!.npc_id).not.toBe(first!.npc_id);
    expect((await tenures('GOV-KN')).find((t) => t.npc_id === first!.npc_id && t.end_reason === 'term_limited')).toBeTruthy();
    const [newDep] = await active('DGOV-KN');
    expect(newDep!.npc_id).not.toBe(dep!.npc_id);
    const parties = await ctx.db.query<{ party_id: string }>('SELECT party_id FROM npcs WHERE id = ANY($1)', [[fresh!.npc_id, newDep!.npc_id]]);
    expect(new Set(parties.rows.map((r) => r.party_id)).size).toBe(1);
    expect((await ctx.db.query("SELECT 1 FROM news_items WHERE kind = 'npc_replaced'")).rows.length).toBeGreaterThanOrEqual(1);
  });

  it('a player who has served two governor terms cannot be elected governor again', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'LA', homeLgaId: 'LA-001' });
    for (let i = 0; i < 2; i++) {
      await give('GOV-LA', p.characterId, 'election');
      await p.call('POST', '/api/office/resign', { confirm: true });
    }
    await expect(give('GOV-LA', p.characterId, 'election')).rejects.toMatchObject({ code: 'term_limit' });
    const e = (await p.call('GET', '/api/seats/GOV-LA/eligibility')).body;
    expect(e.eligible).toBe(false);
    expect(e.reasons.map((r: { code: string }) => r.code)).toContain('term_limit');
    // senators have no limit
    await expect(give('SEN-LA-SD1', p.characterId, 'election')).resolves.toBeTruthy();
  });
});

describe('inactivity, autopilot and chief of staff', () => {
  it('names a chief of staff, who acts while the holder is on autopilot; coming back ends autopilot', async () => {
    const holder = await makePlayer(app, ctx, { homeStateCode: 'RI', homeLgaId: 'RI-001' });
    const aide = await makePlayer(app, ctx);
    expect((await holder.call('POST', '/api/office/chief-of-staff', { characterId: aide.characterId })).body.error).toBe('no_office');
    await give('LGC-RI-001', holder.characterId);
    expect((await holder.call('POST', '/api/office/chief-of-staff', { characterId: holder.characterId })).body.error).toBe('self');
    expect((await holder.call('POST', '/api/office/chief-of-staff', { characterId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    const named = await holder.call('POST', '/api/office/chief-of-staff', { characterId: aide.characterId });
    expect(named.body).toEqual({ ok: true, chiefOfStaff: { id: aide.characterId, name: aide.name } });
    expect((await notes(aide)).some((n) => n.kind === 'chief_of_staff')).toBe(true);

    let detail = (await app.inject({ method: 'GET', url: '/api/seats/LGC-RI-001' })).json();
    expect(detail.acting).toEqual({ type: 'holder', name: holder.name });

    await ctx.db.query("UPDATE characters SET last_active_at = now() - interval '4 days' WHERE id = $1", [holder.characterId]);
    const rep = await runSeatMaintenance(ctx);
    expect(rep.inactivity.autopilot).toBe(1);
    detail = (await app.inject({ method: 'GET', url: '/api/seats/LGC-RI-001' })).json();
    expect(detail.seat.holder.autopilot).toBe(true);
    expect(detail.acting).toEqual({ type: 'chief_of_staff', name: aide.name });
    expect((await notes(aide)).some((n) => n.kind === 'acting_for')).toBe(true);
    // a second run does not notify again
    expect((await runSeatMaintenance(ctx)).inactivity.autopilot).toBe(0);

    // the holder comes back: any signed-in request marks them active and ends autopilot
    expect((await notes(holder)).some((n) => n.kind === 'autopilot')).toBe(true);
    detail = (await app.inject({ method: 'GET', url: '/api/seats/LGC-RI-001' })).json();
    expect(detail.seat.holder.autopilot).toBe(false);

    // clearing the chief of staff: autopilot then falls back to plain autopilot
    expect((await holder.call('POST', '/api/office/chief-of-staff', { characterId: null })).body.chiefOfStaff).toBeNull();
    await ctx.db.query("UPDATE characters SET last_active_at = now() - interval '4 days' WHERE id = $1", [holder.characterId]);
    await runSeatMaintenance(ctx);
    detail = (await app.inject({ method: 'GET', url: '/api/seats/LGC-RI-001' })).json();
    expect(detail.acting).toEqual({ type: 'autopilot', name: null });
    const audit = await ctx.db.query("SELECT details FROM audit_log WHERE action = 'office.chief_of_staff' AND actor_character_id = $1 ORDER BY id", [holder.characterId]);
    expect(audit.rows.map((r) => (r as { details: { chiefOfStaffId: string | null } }).details.chiefOfStaffId)).toEqual([aide.characterId, null]);
  });

  it('a holder away longer than the vacancy limit loses the seat and a by-election is scheduled', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'RI', homeLgaId: 'RI-002' });
    await give('LGC-RI-002', p.characterId);
    await ctx.db.query(`UPDATE characters SET last_active_at = now() - interval '${ctx.game.inactivity.vacancyAfterDays + 1} days' WHERE id = $1`, [p.characterId]);
    const rep = await runSeatMaintenance(ctx);
    expect(rep.inactivity.vacated).toBe(1);
    expect(await active('LGC-RI-002')).toHaveLength(0);
    expect((await tenures('LGC-RI-002')).at(-1)).toMatchObject({ character_id: p.characterId, end_reason: 'inactive' });
    expect(await openElection('LGC-RI-002')).toMatchObject([{ kind: 'by_election', reason: 'inactive' }]);
    expect((await notes(p)).some((n) => n.kind === 'seat_lost_inactive')).toBe(true);
  });

  it('an inactive deputy-holding player is replaced by appointment, not a by-election', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'BA', homeLgaId: 'BA-001' });
    await give('DGOV-BA', p.characterId);
    await ctx.db.query("UPDATE characters SET last_active_at = now() - interval '30 days' WHERE id = $1", [p.characterId]);
    await runSeatMaintenance(ctx);
    expect((await active('DGOV-BA'))[0]).toMatchObject({ holder_type: 'npc', start_reason: 'appointed' });
    expect(await openElection('DGOV-BA')).toHaveLength(0);
  });
});

describe('browsing seats and the map', () => {
  it('lists seats by state and kind with current holders, paged, and filters by holder', async () => {
    const reps = (await app.inject({ method: 'GET', url: '/api/seats?state=LA&kind=REP' })).json();
    expect(reps.total).toBe(24);
    expect(reps.seats).toHaveLength(24);
    for (const s of reps.seats) {
      expect(s).toMatchObject({ kind: 'REP', stateCode: 'LA', kindLabel: 'House of Reps member' });
      expect(s.holder.party.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const page2 = (await app.inject({ method: 'GET', url: '/api/seats?state=LA&kind=REP&limit=10&page=3' })).json();
    expect(page2.seats.map((s: { id: string }) => s.id)).toEqual(reps.seats.slice(20).map((s: { id: string }) => s.id));
    const players = (await app.inject({ method: 'GET', url: '/api/seats?state=LA&holder=player' })).json();
    expect(players.seats.length).toBeGreaterThan(0);
    expect(players.seats.every((s: { holder: { type: string } }) => s.holder.type === 'player')).toBe(true);
    const vacant = (await app.inject({ method: 'GET', url: '/api/seats?holder=vacant' })).json();
    expect(vacant.seats.every((s: { holder: unknown }) => s.holder === null)).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/seats?kind=KING' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/seats/NOPE' })).statusCode).toBe(404);
  });

  it('ward seats: every LGA has wards, each with a councillor and a ward chairman', async () => {
    const lga = (await app.inject({ method: 'GET', url: '/api/map/lgas/LA-011' })).json();
    expect(lga.wards.length).toBeGreaterThanOrEqual(8);
    expect(lga.wards.length).toBeLessThanOrEqual(14);
    for (const w of lga.wards) {
      expect(w.councillor).toMatchObject({ kind: 'COUNCILLOR', wardId: w.id, lgaId: 'LA-011' });
      expect(w.wardChairman).toMatchObject({ kind: 'WARD_CHAIRMAN', wardId: w.id });
      expect(w.councillor.holder.type).toBe('npc');
    }
    expect(lga.chairman.id).toBe('LGC-LA-011');
    expect(lga.district.id).toMatch(/^LA-SD\d$/);
    expect(lga.constituencies.length).toBeGreaterThanOrEqual(1);
    const noWardLga = await ctx.db.query('SELECT count(*)::int AS n FROM lgas l WHERE NOT EXISTS (SELECT 1 FROM wards w WHERE w.lga_id = l.id)');
    expect((noWardLga.rows[0] as { n: number }).n).toBe(0);
    const councillors = (await app.inject({ method: 'GET', url: `/api/seats?ward=${lga.wards[0].id}` })).json();
    expect(councillors.total).toBe(2);
  });

  it('country map: 37 states with governor (none for FCT), seats by party and leading party', async () => {
    const m = (await app.inject({ method: 'GET', url: '/api/map/country' })).json();
    expect(m.states).toHaveLength(37);
    expect(m.parties.map((p: { code: string }) => p.code)).toContain('PUP');
    const fct = m.states.find((s: { code: string }) => s.code === 'FC');
    expect(fct.governor).toBeNull();
    expect(fct.leadingParty).toBeTruthy();
    const lagos = m.states.find((s: { code: string }) => s.code === 'LA');
    expect(lagos.governor.name).toBeTruthy();
    const total = Object.values(lagos.seatsByParty as Record<string, number>).reduce((a, b) => a + b, 0);
    // governor + deputy + 3 senators + 24 reps + 20 LG chairmen, minus vacancies
    const vacant = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM seats s WHERE s.state_code = 'LA' AND s.ward_id IS NULL AND NOT EXISTS (SELECT 1 FROM seat_tenures t WHERE t.seat_id = s.id AND t.ended_at IS NULL)");
    const noParty = await ctx.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE s.state_code = 'LA' AND s.ward_id IS NULL AND t.ended_at IS NULL AND t.holder_type = 'player' AND NOT EXISTS (SELECT 1 FROM party_memberships m WHERE m.character_id = t.character_id AND m.left_at IS NULL)",
    );
    expect(total).toBe(2 + 3 + 24 + 20 - vacant.rows[0]!.n - noParty.rows[0]!.n);
  });

  it('state view lists governor, deputy, senators, reps and every LGA with its chairman', async () => {
    const s = (await app.inject({ method: 'GET', url: '/api/map/states/KN' })).json();
    expect(s.state).toMatchObject({ code: 'KN', name: 'Kano' });
    expect(s.governor.kind).toBe('GOVERNOR');
    expect(s.deputyGovernor.kind).toBe('DEPUTY_GOVERNOR');
    expect(s.senators).toHaveLength(3);
    expect(s.senators[0].districtName).toMatch(/Kano/);
    expect(s.reps).toHaveLength(24);
    expect(s.lgas).toHaveLength(44);
    expect(s.lgas[0]).toMatchObject({ id: 'KN-001', chairman: { kind: 'LG_CHAIRMAN' } });
    expect(s.lgas[0].wards).toBeGreaterThanOrEqual(8);
    expect((await app.inject({ method: 'GET', url: '/api/map/states/XX' })).statusCode).toBe(404);
  });

  it('constituency view shows the rep, the senators and the LGAs with their chairmen', async () => {
    const rep = (await app.inject({ method: 'GET', url: '/api/seats?state=LA&kind=REP&limit=1' })).json().seats[0];
    const c = (await app.inject({ method: 'GET', url: `/api/map/constituencies/${rep.constituencyId}` })).json();
    expect(c.constituency.id).toBe(rep.constituencyId);
    expect(c.rep.id).toBe(rep.id);
    expect(c.rep.holder.name).toBeTruthy();
    expect(c.senators.length).toBeGreaterThanOrEqual(1);
    expect(c.lgas.length).toBeGreaterThanOrEqual(1);
    expect(c.lgas[0].chairman.kind).toBe('LG_CHAIRMAN');
    expect((await app.inject({ method: 'GET', url: '/api/map/constituencies/NOPE' })).statusCode).toBe(404);
  });
});

describe('eligibility', () => {
  it('explains which rules a player fails for a seat', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'LA', homeLgaId: 'LA-020', age: 32 });
    const gov = (await p.call('GET', '/api/seats/GOV-LA/eligibility')).body;
    expect(gov.eligible).toBe(false);
    expect(gov.reasons.map((r: { code: string }) => r.code)).toEqual(['too_young', 'no_prior_office', 'needs_party']);
    expect((await p.call('GET', '/api/seats/LGC-LA-020/eligibility')).body).toEqual({ eligible: true, reasons: [] });
    expect((await p.call('GET', '/api/seats/LGC-LA-019/eligibility')).body.reasons.map((r: { code: string }) => r.code)).toEqual(['wrong_lga']);
    expect((await p.call('GET', '/api/seats/REP-OY-FC01/eligibility')).body.reasons.map((r: { code: string }) => r.code)).toEqual(['wrong_state']);
    // ward chairman needs a party and membership long enough
    await p.call('POST', '/api/parties/LF/join');
    const wch = (await p.call('GET', '/api/seats/WCH-LA-020-W01/eligibility')).body;
    expect(wch.reasons.map((r: { code: string }) => r.code)).toEqual(['party_too_new']);
    await ctx.db.query("UPDATE party_memberships SET joined_at = now() - interval '2 days' WHERE character_id = $1", [p.characterId]);
    expect((await p.call('GET', '/api/seats/WCH-LA-020-W01/eligibility')).body.eligible).toBe(true);
    // holding a qualifying office opens the governorship (age aside)
    await give('LGC-LA-020', p.characterId);
    expect((await p.call('GET', '/api/seats/GOV-LA/eligibility')).body.reasons.map((r: { code: string }) => r.code)).toEqual(['too_young']);
    expect((await app.inject({ method: 'GET', url: '/api/seats/GOV-LA/eligibility' })).statusCode).toBe(401);
  });
});

describe('world tick: NPC decisions and salaries', () => {
  it('NPC governors set state security policy and the NPC president sets the economy, recorded per turn', async () => {
    // make one governor a saint and another a crook
    const saint = { integrity: 95, greed: 5, loyalty: 50, ambition: 80 };
    const crook = { integrity: 5, greed: 95, loyalty: 50, ambition: 30 };
    const npcOf = async (seat: string) => (await active(seat))[0]!.npc_id as string;
    await ctx.db.query('UPDATE npcs SET personality = $2::jsonb WHERE id = $1', [await npcOf('GOV-SO'), JSON.stringify(saint)]);
    await ctx.db.query('UPDATE npcs SET personality = $2::jsonb WHERE id = $1', [await npcOf('GOV-ZA'), JSON.stringify(crook)]);

    const rep = await runOneTick(ctx);
    expect(rep).not.toBeNull();
    const turn = rep!.turn;
    const rows = await ctx.db.query<{ seat_id: string; decision: string; details: { diversion?: number; securityBudget?: number; corruption?: number; spending?: number } }>(
      'SELECT seat_id, decision, details FROM npc_decisions WHERE turn = $1',
      [turn],
    );
    const by = new Map(rows.rows.map((r) => [r.seat_id, r]));
    expect(by.get('GOV-SO')).toMatchObject({ decision: 'security_push', details: { diversion: 0 } });
    expect(by.get('GOV-ZA')).toMatchObject({ decision: 'divert' });
    expect(by.get('GOV-ZA')!.details.diversion).toBeGreaterThan(0.4);
    const npcGovs = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE s.kind = 'GOVERNOR' AND t.ended_at IS NULL AND t.holder_type = 'npc'");
    expect(rows.rows.filter((r) => r.seat_id.startsWith('GOV-'))).toHaveLength(npcGovs.rows[0]!.n);
    const pres = by.get('PRES')!;
    const tick = await ctx.db.query<{ details: { economyInputs: { corruption: number; spending: number }; npcDecisions: number } }>(
      "SELECT details FROM audit_log WHERE action = 'world.tick' AND (details->>'turn')::int = $1",
      [turn],
    );
    expect(tick.rows[0]!.details.economyInputs).toMatchObject({ corruption: pres.details.corruption, spending: pres.details.spending });
    expect(tick.rows[0]!.details.npcDecisions).toBe(rows.rows.length);
    // LG chairmen record only notable decisions
    expect(rows.rows.filter((r) => r.seat_id.startsWith('LGC-')).every((r) => ['project', 'diverted'].includes(r.decision))).toBe(true);
  });

  it('pays a monthly salary to every player holding a seat, and nobody else', async () => {
    const holder = await makePlayer(app, ctx, { homeStateCode: 'KT', homeLgaId: 'KT-001' });
    const former = await makePlayer(app, ctx, { homeStateCode: 'KT', homeLgaId: 'KT-002' });
    await give('LGC-KT-001', holder.characterId);
    await give('CLR-KT-002-W01', former.characterId);
    await former.call('POST', '/api/office/resign', { confirm: true });
    const before = await walletOf(ctx, holder.characterId);
    const beforeFormer = await walletOf(ctx, former.characterId);

    const rep = await runOneTick(ctx);
    const holders = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM seat_tenures WHERE ended_at IS NULL AND holder_type = 'player'");
    expect(rep!.salariesPaid).toBe(holders.rows[0]!.n);
    expect((await walletOf(ctx, holder.characterId)).wallet - before.wallet).toBe(ctx.game.offices.monthlySalary.LG_CHAIRMAN);
    expect((await walletOf(ctx, former.characterId)).wallet).toBe(beforeFormer.wallet);
    const tx = await ctx.db.query("SELECT ref_type, ref_id FROM transactions WHERE character_id = $1 AND reason = 'office_salary'", [holder.characterId]);
    expect(tx.rows).toEqual([{ ref_type: 'seat', ref_id: 'LGC-KT-001' }]);
    expect((await notes(holder)).some((n) => n.kind === 'office_salary')).toBe(true);
  });
});

describe('seat history and audit', () => {
  it('history lists every holder of a seat, newest first, with how they came and went', async () => {
    const h = (await app.inject({ method: 'GET', url: '/api/seats/LGC-KN-001/history' })).json().history as { type: string; name: string; startReason: string; endReason: string | null }[];
    expect(h.map((x) => [x.type, x.startReason, x.endReason])).toEqual([
      ['player', 'by_election', 'removed'],
      ['player', 'takeover', 'resigned'],
      ['npc', 'seeded', 'replaced'],
    ]);
    expect(h[2]!.name).toBeTruthy();
    expect((await app.inject({ method: 'GET', url: '/api/seats/NOPE/history' })).statusCode).toBe(404);
  });

  it('every tenure start and end is in the audit log, with the actor when a player caused it', async () => {
    const p = await makePlayer(app, ctx, { homeStateCode: 'KW', homeLgaId: 'KW-001' });
    await give('LGC-KW-001', p.characterId);
    await p.call('POST', '/api/office/resign', { confirm: true });
    const a = await audits('LGC-KW-001');
    expect(a.map((x) => [x.action, x.details.reason])).toEqual([
      ['tenure.end', 'replaced'],
      ['tenure.start', 'takeover'],
      ['tenure.end', 'resigned'],
    ]);
    expect(a[2]!.actor_character_id).toBe(p.characterId);
    expect(a[1]!.details).toMatchObject({ holderType: 'player', characterId: p.characterId });

    // every non-seeded tenure in the database has a matching start entry, every ended one an end entry
    const missing = await ctx.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM seat_tenures t WHERE
         (t.start_reason <> 'seeded' AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.action = 'tenure.start' AND (a.details->>'tenureId')::bigint = t.id))
         OR (t.ended_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.action = 'tenure.end' AND (a.details->>'tenureId')::bigint = t.id))`,
    );
    expect(missing.rows[0]!.n).toBe(0);
  });

  it('only the seats module (and the seeder) writes to seat_tenures', () => {
    const src = resolve(import.meta.dirname, '../src');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith('.ts')) files.push(join(d, e.name));
      }
    };
    walk(src);
    const writers = files.filter((f) => /(INSERT INTO|UPDATE|DELETE FROM)\s+seat_tenures|'seat_tenures',/.test(readFileSync(f, 'utf8'))).map((f) => relative(src, f));
    expect(writers.sort()).toEqual(['game/seats.ts', 'world/seed.ts']);
  });
});
