import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BACKGROUNDS, buildCharacter, gameDateAt, validateCharacter, type BackgroundId } from '@avm/engine';
import { STATES } from '@avm/data';
import type { AppContext } from '../context.js';
import { audit } from '../audit.js';
import { GameError, conflict, energyNow, notFound, requireCharacter, type CharacterRow } from './core.js';
import { publishNews } from './news.js';

const createSchema = z.object({
  name: z.string(),
  gender: z.enum(['male', 'female']),
  age: z.number(),
  homeStateCode: z.string(),
  homeLgaId: z.string(),
  background: z.string(),
  traits: z.array(z.string()),
});

export function lgaName(lgaId: string): string {
  const [code, idx] = lgaId.split('-');
  const st = STATES.find((s) => s.code === code);
  return st?.lgas[Number(idx) - 1] ?? lgaId;
}

export function stateName(code: string): string {
  return STATES.find((s) => s.code === code)?.name ?? code;
}

/** Everything the dashboard/profile needs about the current player. */
export async function characterProfile(ctx: AppContext, c: CharacterRow) {
  const db = ctx.db;
  const [party, groups, roles, seat, businesses, unread] = await Promise.all([
    db.query<{ id: string; code: string; name: string; color: string; joined_at: Date }>(
      `SELECT p.id, p.code, p.name, p.color, m.joined_at FROM party_memberships m JOIN parties p ON p.id = m.party_id
       WHERE m.character_id = $1 AND m.left_at IS NULL`,
      [c.id],
    ),
    db.query<{ group_kind: string }>('SELECT group_kind FROM group_memberships WHERE character_id = $1 AND left_at IS NULL ORDER BY group_kind', [c.id]),
    db.query<{ role: string }>('SELECT role FROM volunteer_roles WHERE character_id = $1 AND ended_at IS NULL ORDER BY role', [c.id]),
    db.query<{ id: string; name: string; kind: string }>(
      `SELECT s.id, s.name, s.kind FROM seat_tenures t JOIN seats s ON s.id = t.seat_id WHERE t.character_id = $1 AND t.ended_at IS NULL`,
      [c.id],
    ),
    db.query<{ n: number }>('SELECT count(*)::int AS n FROM businesses WHERE owner_id = $1 AND closed_at IS NULL', [c.id]),
    db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE character_id = $1 AND read_at IS NULL', [c.id]),
  ]);
  const background = BACKGROUNDS[c.background as BackgroundId];
  return {
    id: c.id,
    name: c.name,
    gender: c.gender,
    age: c.age,
    homeStateCode: c.home_state_code,
    homeStateName: stateName(c.home_state_code),
    homeLgaId: c.home_lga_id,
    homeLgaName: lgaName(c.home_lga_id),
    background: c.background,
    backgroundLabel: background?.label ?? c.background,
    perks: background?.perks ?? [],
    traits: c.traits,
    stats: c.stats,
    wallet: Number(c.wallet),
    warChest: Number(c.war_chest),
    energy: Math.floor(energyNow(c)),
    journalistRep: c.journalist_rep,
    avatarSeed: c.avatar_seed,
    party: party.rows[0] ?? null,
    groups: groups.rows.map((g) => g.group_kind),
    volunteerRoles: roles.rows.map((r) => r.role),
    office: seat.rows[0] ?? null,
    activeBusinesses: businesses.rows[0]?.n ?? 0,
    unreadNotifications: unread.rows[0]?.n ?? 0,
    createdAt: c.created_at,
  };
}

export function registerCharacterRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/api/characters', async (req, reply) => {
    if (!req.user) throw new GameError(401, 'unauthenticated', 'Abeg, log in first.');
    if (!req.user.emailVerified) throw new GameError(403, 'forbidden', 'Confirm your email first.');
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new GameError(400, 'invalid_input', 'Invalid character data.');
    const input = parsed.data as Parameters<typeof validateCharacter>[0];
    const v = validateCharacter(input);
    if (!v.ok) return reply.code(400).send({ error: 'invalid_character', message: Object.values(v.errors)[0], fields: v.errors });
    const build = buildCharacter(input);
    const userId = req.user.id;
    try {
      const c = await ctx.db.transaction(async (tx) => {
        const r = await tx.query<CharacterRow>(
          `INSERT INTO characters (user_id, name, gender, age, home_state_code, home_lga_id, background, traits, stats, wallet, war_chest)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11) RETURNING *`,
          [userId, input.name.trim().replace(/\s+/g, ' '), input.gender, input.age, input.homeStateCode, input.homeLgaId, input.background, input.traits, JSON.stringify(build.stats), build.wallet, build.warChest],
        );
        const row = r.rows[0] as CharacterRow;
        await tx.query("INSERT INTO transactions (character_id, account, delta, reason) VALUES ($1, 'wallet', $2, 'starting_funds')", [row.id, build.wallet]);
        await audit(tx, { action: 'character.create', actorUserId: userId, actorCharacterId: row.id, targetType: 'character', targetId: row.id, details: { background: input.background, traits: input.traits }, ip: req.ip });
        await publishNews(tx, {
          kind: 'character_created',
          vars: { name: row.name, lga: lgaName(row.home_lga_id), state: stateName(row.home_state_code) },
          source: 'player',
          stateCode: row.home_state_code,
          actorId: row.id,
        });
        return row;
      });
      return reply.code(201).send({ character: await characterProfile(ctx, c) });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('character_exists', 'You already have a character.');
      throw e;
    }
  });

  app.get('/api/me/character', async (req) => {
    const c = await requireCharacter(ctx, req);
    return { character: await characterProfile(ctx, c) };
  });

  /** Public view of another player (no money, no hidden stats). */
  app.get('/api/characters/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Character not found.');
    const r = await ctx.db.query<CharacterRow>('SELECT * FROM characters WHERE id = $1', [id]);
    const c = r.rows[0];
    if (!c) throw notFound('Character not found.');
    const p = await characterProfile(ctx, c);
    return {
      character: {
        id: p.id,
        name: p.name,
        gender: p.gender,
        homeStateName: p.homeStateName,
        homeLgaName: p.homeLgaName,
        backgroundLabel: p.backgroundLabel,
        avatarSeed: p.avatarSeed,
        party: p.party,
        office: p.office,
        publicImage: p.stats.publicImage,
        journalistRep: p.journalistRep,
      },
    };
  });

  app.get('/api/characters', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return { characters: [] };
    const r = await ctx.db.query<{ id: string; name: string; home_state_code: string }>(
      "SELECT id, name, home_state_code FROM characters WHERE name ILIKE '%' || $1 || '%' ORDER BY name LIMIT 20",
      [q.replace(/[%_]/g, '')],
    );
    return { characters: r.rows.map((c) => ({ id: c.id, name: c.name, stateName: stateName(c.home_state_code) })) };
  });

  app.get('/api/world/clock', async () => {
    const r = await ctx.db.query<{ clock_epoch: Date; last_tick_turn: number }>('SELECT clock_epoch, last_tick_turn FROM world_state WHERE id = 1');
    const ws = r.rows[0];
    if (!ws) throw notFound('World not seeded.');
    const now = Date.now();
    const date = gameDateAt(ctx.game.calendar, new Date(ws.clock_epoch).getTime(), now);
    return { date, lastTickTurn: ws.last_tick_turn, msPerGameMonth: ctx.game.calendar.realMsPerGameMonth, serverTime: now };
  });
}
