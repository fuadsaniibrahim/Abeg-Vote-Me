import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { audit } from '../audit.js';
import { GameError, bad, conflict, formatWait, notFound, requireCharacter } from './core.js';
import { publishNews } from './news.js';

export function registerPartyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/parties', async () => {
    const r = await ctx.db.query<{
      id: string;
      code: string;
      name: string;
      slogan: string;
      color: string;
      ideology: string;
      is_independent: boolean;
      treasury: number;
      player_members: number;
      seats_held: number;
    }>(
      `SELECT p.id, p.code, p.name, p.slogan, p.color, p.ideology, p.is_independent, p.treasury,
         (SELECT count(*)::int FROM party_memberships m WHERE m.party_id = p.id AND m.left_at IS NULL) AS player_members,
         (SELECT count(*)::int FROM seat_tenures t
            LEFT JOIN npcs n ON n.id = t.npc_id
            LEFT JOIN party_memberships pm ON pm.character_id = t.character_id AND pm.left_at IS NULL
          WHERE t.ended_at IS NULL AND (n.party_id = p.id OR pm.party_id = p.id)) AS seats_held
       FROM parties p ORDER BY p.is_independent, seats_held DESC, p.name`,
    );
    return {
      parties: r.rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        slogan: p.slogan,
        color: p.color,
        ideology: p.ideology,
        isIndependent: p.is_independent,
        treasury: Number(p.treasury),
        playerMembers: p.player_members,
        seatsHeld: p.seats_held,
      })),
    };
  });

  app.post('/api/parties/:code/join', async (req) => {
    const { code } = req.params as { code: string };
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const p = await tx.query<{ id: string; name: string; is_independent: boolean }>('SELECT id, name, is_independent FROM parties WHERE code = $1', [code]);
      const party = p.rows[0];
      if (!party) throw notFound('No such party.');
      if (party.is_independent) throw bad('not_a_party', 'Independent is not a party you can join. Just leave your party.');
      const current = await tx.query('SELECT 1 FROM party_memberships WHERE character_id = $1 AND left_at IS NULL', [c.id]);
      if (current.rows.length) throw conflict('already_member', 'Leave your current party first.');
      const last = await tx.query<{ left_at: Date }>('SELECT left_at FROM party_memberships WHERE character_id = $1 AND left_at IS NOT NULL ORDER BY left_at DESC LIMIT 1', [c.id]);
      if (last.rows[0]) {
        const wait = new Date(last.rows[0].left_at).getTime() + ctx.game.citizen.partyRejoinCooldownHours * 3_600_000 - Date.now();
        if (wait > 0) throw new GameError(429, 'cooldown', `You just left a party. Wait ${formatWait(wait)} before joining another.`);
      }
      await tx.query('INSERT INTO party_memberships (party_id, character_id) VALUES ($1, $2)', [party.id, c.id]);
      await audit(tx, { action: 'party.join', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'party', targetId: party.id, ip: req.ip });
      await publishNews(tx, { kind: 'party_joined', vars: { name: c.name, party: party.name }, source: 'player', stateCode: c.home_state_code, actorId: c.id });
      return { ok: true, party: { id: party.id, code, name: party.name } };
    });
  });

  app.post('/api/parties/leave', async (req) => {
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const r = await tx.query<{ party_id: string; name: string }>(
        `UPDATE party_memberships m SET left_at = now() FROM parties p
         WHERE m.character_id = $1 AND m.left_at IS NULL AND p.id = m.party_id RETURNING m.party_id, p.name`,
        [c.id],
      );
      const left = r.rows[0];
      if (!left) throw bad('not_member', 'You are not in any party.');
      // volunteering is tied to the party
      await tx.query('UPDATE volunteer_roles SET ended_at = now() WHERE character_id = $1 AND ended_at IS NULL', [c.id]);
      await audit(tx, { action: 'party.leave', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'party', targetId: left.party_id, ip: req.ip });
      await publishNews(tx, { kind: 'party_left', vars: { name: c.name, party: left.name }, source: 'player', stateCode: c.home_state_code, actorId: c.id });
      return { ok: true };
    });
  });
}
