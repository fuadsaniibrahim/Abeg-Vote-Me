// Seat browsing, the map views, seat history and eligibility, and office actions (resign, chief of staff).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SEAT_KINDS, SEAT_KIND_LABELS, averageInsecurity, deputySeatOf, principalSeatOf, type InsecurityLevels, type SeatKind, type UnitProfile } from '@avm/engine';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
import { audit } from '../audit.js';
import { bad, notFound, requireCharacter } from './core.js';
import { deliver, notify } from './notify.js';
import { eligibilityFor, setChiefOfStaff, vacateSeat, type SeatRow } from './seats.js';

// Active holder of seat `s`, with party (a player's current party, or the NPC's party).
const HOLDER_COLS = `t.id AS tenure_id, t.holder_type, t.character_id, t.npc_id, t.started_at, t.term_ends_at, t.autopilot_since,
  t.chief_of_staff_id, t.start_reason, COALESCE(c.name, n.name) AS holder_name, c.avatar_seed,
  p.code AS party_code, p.name AS party_name, p.color AS party_color`;
const HOLDER_JOINS = `LEFT JOIN seat_tenures t ON t.seat_id = s.id AND t.ended_at IS NULL
  LEFT JOIN characters c ON c.id = t.character_id
  LEFT JOIN npcs n ON n.id = t.npc_id
  LEFT JOIN party_memberships pm ON pm.character_id = t.character_id AND pm.left_at IS NULL
  LEFT JOIN parties p ON p.id = COALESCE(pm.party_id, n.party_id)`;
const SEAT_COLS = 's.id, s.kind, s.name, s.state_code, s.district_id, s.constituency_id, s.lga_id, s.ward_id';

interface HolderRow {
  tenure_id: number | null;
  holder_type: 'npc' | 'player' | null;
  character_id: string | null;
  npc_id: string | null;
  started_at: Date | null;
  term_ends_at: Date | null;
  autopilot_since: Date | null;
  chief_of_staff_id: string | null;
  start_reason: string | null;
  holder_name: string | null;
  avatar_seed: string | null;
  party_code: string | null;
  party_name: string | null;
  party_color: string | null;
}
type SeatWithHolder = SeatRow & HolderRow;

export interface HolderView {
  tenureId: number;
  type: 'npc' | 'player';
  id: string;
  name: string;
  avatarSeed: string | null;
  party: { code: string; name: string; color: string } | null;
  since: Date;
  termEndsAt: Date | null;
  /** Term has ended; the holder stays until a successor takes the seat. */
  holdingOver: boolean;
  autopilot: boolean;
  startReason: string;
}

function holderView(r: HolderRow, nowMs = Date.now()): HolderView | null {
  if (!r.tenure_id || !r.holder_type) return null;
  return {
    tenureId: r.tenure_id,
    type: r.holder_type,
    id: (r.character_id ?? r.npc_id) as string,
    name: r.holder_name ?? 'Unknown',
    avatarSeed: r.avatar_seed,
    party: r.party_code ? { code: r.party_code, name: r.party_name as string, color: r.party_color as string } : null,
    since: r.started_at as Date,
    termEndsAt: r.term_ends_at,
    holdingOver: !!r.term_ends_at && new Date(r.term_ends_at).getTime() <= nowMs,
    autopilot: !!r.autopilot_since,
    startReason: r.start_reason as string,
  };
}

function seatView(r: SeatWithHolder) {
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: SEAT_KIND_LABELS[r.kind],
    name: r.name,
    stateCode: r.state_code,
    districtId: r.district_id,
    constituencyId: r.constituency_id,
    lgaId: r.lga_id,
    wardId: r.ward_id,
    holder: holderView(r),
  };
}

async function seatsWhere(db: Queryable, where: string, params: unknown[], order = 's.id', page?: { limit: number; offset: number }): Promise<ReturnType<typeof seatView>[]> {
  const paging = page ? ` LIMIT ${Math.floor(page.limit)} OFFSET ${Math.floor(page.offset)}` : '';
  const r = await db.query<SeatWithHolder>(`SELECT ${SEAT_COLS}, ${HOLDER_COLS} FROM seats s ${HOLDER_JOINS} WHERE ${where} ORDER BY ${order}${paging}`, params);
  return r.rows.map(seatView);
}

async function oneSeat(db: Queryable, id: string) {
  const [s] = await seatsWhere(db, 's.id = $1', [id]);
  if (!s) throw notFound('No such seat.');
  return s;
}

const listQuery = z.object({
  state: z.string().max(3).optional(),
  kind: z.enum(SEAT_KINDS).optional(),
  lga: z.string().max(20).optional(),
  ward: z.string().max(24).optional(),
  holder: z.enum(['npc', 'player', 'vacant']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function stateInsecurity(db: Queryable): Promise<Record<string, InsecurityLevels>> {
  const r = await db.query<{ metrics: { insecurity?: Record<string, InsecurityLevels> } }>('SELECT metrics FROM world_state WHERE id = 1');
  return r.rows[0]?.metrics.insecurity ?? {};
}

export function registerOfficeRoutes(app: FastifyInstance, ctx: AppContext) {
  const db = ctx.db;

  // ---------- seats ----------

  app.get('/api/seats', async (req) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) throw bad('invalid_query', 'Invalid seat filter.');
    const { state, kind, lga, ward, holder, page, limit } = q.data;
    const conds: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      conds.push(sql.replace('?', `$${params.length}`));
    };
    if (state) add('s.state_code = ?', state);
    if (kind) add('s.kind = ?', kind);
    if (lga) add('s.lga_id = ?', lga);
    if (ward) add('s.ward_id = ?', ward);
    if (holder === 'vacant') conds.push('t.id IS NULL');
    else if (holder) add('t.holder_type = ?', holder);
    const where = conds.length ? conds.join(' AND ') : 'true';
    const total = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM seats s LEFT JOIN seat_tenures t ON t.seat_id = s.id AND t.ended_at IS NULL WHERE ${where}`, params);
    const seats = await seatsWhere(db, where, params, 's.id', { limit, offset: (page - 1) * limit });
    return { total: total.rows[0]?.n ?? 0, page, limit, seats };
  });

  app.get('/api/seats/:id', async (req) => {
    const { id } = req.params as { id: string };
    const seat = await oneSeat(db, id);
    const depId = deputySeatOf(seat.id);
    const prinId = principalSeatOf(seat.id);
    const deputy = depId ? await oneSeat(db, depId) : null;
    const principal = prinId ? await oneSeat(db, prinId) : null;
    const t = await db.query<{ chief_of_staff_id: string | null; cos_name: string | null }>(
      'SELECT t.chief_of_staff_id, c.name AS cos_name FROM seat_tenures t LEFT JOIN characters c ON c.id = t.chief_of_staff_id WHERE t.seat_id = $1 AND t.ended_at IS NULL',
      [seat.id],
    );
    const cos = t.rows[0]?.chief_of_staff_id ? { id: t.rows[0].chief_of_staff_id, name: t.rows[0].cos_name as string } : null;
    const election = await db.query<{ id: number; kind: string; reason: string; scheduled_for: Date }>(
      "SELECT id, kind, reason, scheduled_for FROM scheduled_elections WHERE seat_id = $1 AND status = 'scheduled'",
      [seat.id],
    );
    // who acts while a player holder is away: their chief of staff, else the deputy, else autopilot
    let acting: { type: 'holder' | 'chief_of_staff' | 'deputy' | 'autopilot'; name: string | null } | null = null;
    if (seat.holder) {
      if (!seat.holder.autopilot) acting = { type: 'holder', name: seat.holder.name };
      else if (cos) acting = { type: 'chief_of_staff', name: cos.name };
      else if (deputy?.holder) acting = { type: 'deputy', name: deputy.holder.name };
      else acting = { type: 'autopilot', name: null };
    }
    const me = req.user ? await db.query<{ id: string }>('SELECT id FROM characters WHERE user_id = $1', [req.user.id]) : null;
    const salary = ctx.game.offices.monthlySalary[seat.kind] ?? 0;
    return {
      seat: { ...seat, salary, mine: !!me?.rows[0] && seat.holder?.id === me.rows[0].id },
      deputy,
      principal,
      chiefOfStaff: cos,
      acting,
      openElection: election.rows[0] ? { id: election.rows[0].id, kind: election.rows[0].kind, reason: election.rows[0].reason, scheduledFor: election.rows[0].scheduled_for } : null,
    };
  });

  app.get('/api/seats/:id/history', async (req) => {
    const { id } = req.params as { id: string };
    await oneSeat(db, id);
    const r = await db.query<{
      id: number;
      holder_type: 'npc' | 'player';
      character_id: string | null;
      npc_id: string | null;
      name: string;
      party_code: string | null;
      party_color: string | null;
      started_at: Date;
      ended_at: Date | null;
      start_reason: string;
      end_reason: string | null;
    }>(
      // party shown for NPCs only: a player's party at the time is not recorded on the tenure
      `SELECT t.id, t.holder_type, t.character_id, t.npc_id, COALESCE(c.name, n.name) AS name, p.code AS party_code, p.color AS party_color,
         t.started_at, t.ended_at, t.start_reason, t.end_reason
       FROM seat_tenures t LEFT JOIN characters c ON c.id = t.character_id LEFT JOIN npcs n ON n.id = t.npc_id LEFT JOIN parties p ON p.id = n.party_id
       WHERE t.seat_id = $1 ORDER BY t.started_at DESC, t.id DESC LIMIT 100`,
      [id],
    );
    return {
      history: r.rows.map((h) => ({
        tenureId: h.id,
        type: h.holder_type,
        id: h.character_id ?? h.npc_id,
        name: h.name,
        party: h.party_code ? { code: h.party_code, color: h.party_color } : null,
        startedAt: h.started_at,
        endedAt: h.ended_at,
        startReason: h.start_reason,
        endReason: h.end_reason,
      })),
    };
  });

  app.get('/api/seats/:id/eligibility', async (req) => {
    const c = await requireCharacter(ctx, req);
    const { id } = req.params as { id: string };
    const r = await db.query<SeatRow>('SELECT id, kind, name, state_code, district_id, constituency_id, lga_id, ward_id FROM seats WHERE id = $1', [id]);
    if (!r.rows[0]) throw notFound('No such seat.');
    return eligibilityFor(db, ctx.game, c.id, r.rows[0]);
  });

  // ---------- map ----------

  app.get('/api/map/country', async () => {
    const govs = await db.query<SeatWithHolder & { code: string; state_name: string; zone: string; is_fct: boolean }>(
      `SELECT st.code, st.name AS state_name, st.zone, st.is_fct, ${SEAT_COLS}, ${HOLDER_COLS}
       FROM states st LEFT JOIN seats s ON s.id = 'GOV-' || st.code ${HOLDER_JOINS} ORDER BY st.name`,
    );
    // seats by party per state (ward seats left out: they would swamp everything else)
    const tally = await db.query<{ state_code: string; code: string; n: number }>(
      `SELECT s.state_code, p.code, count(*)::int AS n FROM seats s
       JOIN seat_tenures t ON t.seat_id = s.id AND t.ended_at IS NULL
       LEFT JOIN npcs n ON n.id = t.npc_id
       LEFT JOIN party_memberships pm ON pm.character_id = t.character_id AND pm.left_at IS NULL
       JOIN parties p ON p.id = COALESCE(pm.party_id, n.party_id)
       WHERE s.state_code IS NOT NULL AND s.ward_id IS NULL GROUP BY 1, 2`,
    );
    const parties = await db.query<{ code: string; name: string; color: string }>('SELECT code, name, color FROM parties ORDER BY is_independent, name');
    const insecurity = await stateInsecurity(db);
    return {
      parties: parties.rows,
      states: govs.rows.map((g) => {
        const seatsByParty = Object.fromEntries(tally.rows.filter((t) => t.state_code === g.code).map((t) => [t.code, t.n]));
        const leading = Object.entries(seatsByParty).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
        const lv = insecurity[g.code];
        return {
          code: g.code,
          name: g.state_name,
          zone: g.zone,
          isFct: g.is_fct,
          governor: g.id ? holderView(g) : null,
          seatsByParty,
          leadingParty: leading,
          insecurity: lv ? Math.round(averageInsecurity(lv)) : null,
        };
      }),
    };
  });

  app.get('/api/map/states/:code', async (req) => {
    const { code } = req.params as { code: string };
    const st = await db.query<{ code: string; name: string; capital: string; zone: string; is_fct: boolean; profile: UnitProfile }>('SELECT * FROM states WHERE code = $1', [code]);
    const state = st.rows[0];
    if (!state) throw notFound('No such state.');
    const seats = await seatsWhere(db, "s.state_code = $1 AND s.kind IN ('GOVERNOR', 'DEPUTY_GOVERNOR', 'SENATOR', 'REP', 'LG_CHAIRMAN')", [code]);
    const names = await db.query<{ id: string; name: string; kind: string }>(
      `SELECT id, name, 'district' AS kind FROM senatorial_districts WHERE state_code = $1
       UNION ALL SELECT id, name, 'constituency' FROM federal_constituencies WHERE state_code = $1
       UNION ALL SELECT id, name, 'lga' FROM lgas WHERE state_code = $1`,
      [code],
    );
    const nameOf = new Map(names.rows.map((n) => [n.id, n.name]));
    const wards = await db.query<{ lga_id: string; n: number }>('SELECT lga_id, count(*)::int AS n FROM wards WHERE state_code = $1 GROUP BY lga_id', [code]);
    const wardCount = new Map(wards.rows.map((w) => [w.lga_id, w.n]));
    const lv = (await stateInsecurity(db))[code] ?? state.profile.insecurity;
    const byKind = (k: SeatKind) => seats.filter((s) => s.kind === k);
    return {
      state: { code: state.code, name: state.name, capital: state.capital, zone: state.zone, isFct: state.is_fct, population: state.profile.population, wealth: state.profile.wealth, insecurity: Math.round(averageInsecurity(lv)) },
      governor: byKind('GOVERNOR')[0] ?? null,
      deputyGovernor: byKind('DEPUTY_GOVERNOR')[0] ?? null,
      senators: byKind('SENATOR').map((s) => ({ ...s, districtName: nameOf.get(s.districtId as string) ?? '' })),
      reps: byKind('REP').map((s) => ({ ...s, constituencyName: nameOf.get(s.constituencyId as string) ?? '' })),
      // LGAs keep data order (the order districts and constituencies were built in)
      lgas: byKind('LG_CHAIRMAN')
        .sort((a, b) => (a.lgaId as string).localeCompare(b.lgaId as string))
        .map((s) => ({ id: s.lgaId as string, name: nameOf.get(s.lgaId as string) ?? '', wards: wardCount.get(s.lgaId as string) ?? 0, chairman: s })),
    };
  });

  app.get('/api/map/constituencies/:id', async (req) => {
    const { id } = req.params as { id: string };
    const r = await db.query<{ id: string; name: string; state_code: string; profile: UnitProfile }>('SELECT * FROM federal_constituencies WHERE id = $1', [id]);
    const fc = r.rows[0];
    if (!fc) throw notFound('No such constituency.');
    const lgas = await db.query<{ id: string; name: string; share: number }>(
      'SELECT l.id, l.name, cl.share FROM constituency_lgas cl JOIN lgas l ON l.id = cl.lga_id WHERE cl.constituency_id = $1 ORDER BY l.id',
      [id],
    );
    const lgaIds = lgas.rows.map((l) => l.id);
    const chairmen = await seatsWhere(db, "s.kind = 'LG_CHAIRMAN' AND s.lga_id = ANY($1)", [lgaIds]);
    const senators = await seatsWhere(db, "s.kind = 'SENATOR' AND s.district_id IN (SELECT district_id FROM district_lgas WHERE lga_id = ANY($1))", [lgaIds]);
    const districts = await db.query<{ id: string; name: string }>('SELECT id, name FROM senatorial_districts WHERE id = ANY($1)', [senators.map((s) => s.districtId)]);
    return {
      constituency: { id: fc.id, name: fc.name, stateCode: fc.state_code, population: fc.profile.population, wealth: fc.profile.wealth },
      rep: await oneSeat(db, `REP-${fc.id}`),
      senators: senators.map((s) => ({ ...s, districtName: districts.rows.find((d) => d.id === s.districtId)?.name ?? '' })),
      lgas: lgas.rows.map((l) => ({ id: l.id, name: l.name, share: Number(l.share), chairman: chairmen.find((c) => c.lgaId === l.id) ?? null })),
    };
  });

  app.get('/api/map/lgas/:id', async (req) => {
    const { id } = req.params as { id: string };
    const r = await db.query<{ id: string; name: string; state_code: string; is_capital: boolean; profile: UnitProfile }>('SELECT * FROM lgas WHERE id = $1', [id]);
    const lga = r.rows[0];
    if (!lga) throw notFound('No such LGA.');
    const wardSeats = await seatsWhere(db, 's.lga_id = $1 AND s.ward_id IS NOT NULL', [id], 's.ward_id, s.kind');
    const wards = await db.query<{ id: string; name: string; number: number }>('SELECT id, name, number FROM wards WHERE lga_id = $1 ORDER BY number', [id]);
    const constituencies = await db.query<{ id: string; name: string }>(
      'SELECT fc.id, fc.name FROM constituency_lgas cl JOIN federal_constituencies fc ON fc.id = cl.constituency_id WHERE cl.lga_id = $1 ORDER BY fc.id',
      [id],
    );
    const district = await db.query<{ id: string; name: string }>('SELECT d.id, d.name FROM district_lgas dl JOIN senatorial_districts d ON d.id = dl.district_id WHERE dl.lga_id = $1', [id]);
    return {
      lga: { id: lga.id, name: lga.name, stateCode: lga.state_code, isCapital: lga.is_capital, population: lga.profile.population, wealth: lga.profile.wealth },
      chairman: await oneSeat(db, `LGC-${lga.id}`),
      constituencies: constituencies.rows,
      district: district.rows[0] ?? null,
      wards: wards.rows.map((w) => ({
        id: w.id,
        name: w.name,
        number: w.number,
        councillor: wardSeats.find((s) => s.wardId === w.id && s.kind === 'COUNCILLOR') ?? null,
        wardChairman: wardSeats.find((s) => s.wardId === w.id && s.kind === 'WARD_CHAIRMAN') ?? null,
      })),
    };
  });

  // ---------- office actions ----------

  app.post('/api/office/resign', async (req) => {
    const body = z.object({ confirm: z.literal(true) }).safeParse(req.body);
    if (!body.success) throw bad('confirm_required', 'Confirm that you want to resign.');
    const out = await db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const t = await tx.query<{ seat_id: string; name: string }>('SELECT t.seat_id, s.name FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE t.character_id = $1 AND t.ended_at IS NULL', [c.id]);
      const held = t.rows[0];
      if (!held) throw bad('no_office', 'You do not hold any office.');
      const v = await vacateSeat(tx, ctx.game, held.seat_id, 'resigned', { actor: { userId: c.user_id, characterId: c.id } });
      await audit(tx, { action: 'office.resign', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'seat', targetId: held.seat_id, details: { plan: v.plan }, ip: req.ip });
      return { seatId: held.seat_id, seatName: held.name, plan: v.plan, successor: v.successor, electionId: v.electionId, notes: v.notifications };
    });
    deliver(ctx.realtime, out.notes);
    const { notes: _notes, ...rest } = out;
    return { ok: true, ...rest };
  });

  app.post('/api/office/chief-of-staff', async (req) => {
    const body = z.object({ characterId: z.uuid().nullable() }).safeParse(req.body);
    if (!body.success) throw bad('invalid_input', 'Pick a player to name as chief of staff.');
    const target = body.data.characterId;
    const out = await db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const t = await tx.query<{ id: number; seat_id: string; name: string }>(
        'SELECT t.id, t.seat_id, s.name FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE t.character_id = $1 AND t.ended_at IS NULL FOR UPDATE OF t',
        [c.id],
      );
      const held = t.rows[0];
      if (!held) throw bad('no_office', 'You must hold an office to name a chief of staff.');
      let name: string | null = null;
      if (target) {
        if (target === c.id) throw bad('self', 'You cannot be your own chief of staff.');
        const r = await tx.query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [target]);
        if (!r.rows[0]) throw notFound('Player not found.');
        name = r.rows[0].name;
      }
      await setChiefOfStaff(tx, held.id, target);
      await audit(tx, { action: 'office.chief_of_staff', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'seat', targetId: held.seat_id, details: { chiefOfStaffId: target }, ip: req.ip });
      const notes = target ? [await notify(tx, target, 'chief_of_staff', `${c.name} named you chief of staff`, `You will act for the ${held.name} while they are away.`)] : [];
      return { chiefOfStaff: target ? { id: target, name } : null, notes };
    });
    deliver(ctx.realtime, out.notes);
    return { ok: true, chiefOfStaff: out.chiefOfStaff };
  });
}
