// Citizen actions: donate, rally, volunteer, petitions, protests, civic groups.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CIVIC_GROUPS, PROTEST_ISSUES } from '@avm/data';
import { ACTION_ENERGY, INSECURITY_TYPES, filterMessage, formatNaira, mentionsRealPolitician, protestOutcome, rallyOutcome, type UnitProfile } from '@avm/engine';
import type { AppContext } from '../context.js';
import { audit } from '../audit.js';
import { applyMods, bad, conflict, credit, debit, freshRng, lockCharacter, notFound, requireCharacter, spendEnergy, useCooldown } from './core.js';
import { publishNews } from './news.js';
import { deliver, notify, type NotificationRow } from './notify.js';
import { stateName } from './characters.js';

const uuid = z.string().regex(/^[0-9a-f-]{36}$/);

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw bad('invalid_input', r.error.issues[0]?.message ?? 'Invalid input');
  return r.data;
}

/** Text a player typed that will be shown to others: filtered, and no real politicians. */
function cleanPublicText(raw: string, field: string): string {
  const f = filterMessage(raw);
  if (!f.ok) throw bad('rejected_text', `${field}: ${f.reason}`);
  if (mentionsRealPolitician(f.text)) throw bad('real_person', `${field}: no real politicians, abeg. Keep am fictional.`);
  return f.text;
}

export function registerCitizenRoutes(app: FastifyInstance, ctx: AppContext) {
  const cfg = ctx.game.citizen;

  // ---------- donations ----------
  app.post('/api/donations', async (req) => {
    const body = parseBody(
      z.object({
        recipientType: z.enum(['party', 'candidate']),
        recipientId: z.string(),
        amount: z.number().int().min(cfg.minDonation, `Minimum donation is ${formatNaira(cfg.minDonation)}`).max(cfg.maxDonation, `Maximum donation is ${formatNaira(cfg.maxDonation)}`),
      }),
      req.body,
    );
    const pending: NotificationRow[] = [];
    const result = await ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      let recipientName: string;
      if (body.recipientType === 'party') {
        const p = await tx.query<{ id: string; name: string; is_independent: boolean }>('SELECT id, name, is_independent FROM parties WHERE code = $1 OR id::text = $1', [body.recipientId]);
        const party = p.rows[0];
        if (!party || party.is_independent) throw notFound('No such party.');
        await debit(tx, c.id, 'wallet', body.amount, 'donation_to_party', { type: 'party', id: party.id });
        await tx.query('UPDATE parties SET treasury = treasury + $2 WHERE id = $1', [party.id, body.amount]);
        recipientName = party.name;
      } else {
        if (body.recipientId === c.id) throw bad('self_donation', 'You cannot donate to yourself.');
        if (!uuid.safeParse(body.recipientId).success) throw notFound('No such candidate.');
        const target = await lockCharacter(tx, body.recipientId);
        await debit(tx, c.id, 'wallet', body.amount, 'donation_to_candidate', { type: 'character', id: target.id });
        // donations go to the campaign war chest, never the personal wallet
        await credit(tx, target.id, 'warChest', body.amount, 'donation_received', { type: 'character', id: c.id });
        pending.push(await notify(tx, target.id, 'donation', `${c.name} donated ${formatNaira(body.amount)} to your campaign`));
        recipientName = target.name;
      }
      await audit(tx, {
        action: 'money.donate',
        actorUserId: c.user_id,
        actorCharacterId: c.id,
        targetType: body.recipientType,
        targetId: body.recipientId,
        details: { amount: body.amount },
        ip: req.ip,
      });
      if (body.amount >= 1_000_000) {
        await publishNews(tx, { kind: 'donation', vars: { name: c.name, amount: formatNaira(body.amount), recipient: recipientName }, source: 'player', actorId: c.id });
      }
      const w = await tx.query<{ wallet: number }>('SELECT wallet FROM characters WHERE id = $1', [c.id]);
      return { ok: true, wallet: Number(w.rows[0]?.wallet), recipient: recipientName };
    });
    deliver(ctx.realtime, pending);
    return result;
  });

  // ---------- rally ----------
  app.post('/api/actions/rally', async (req) => {
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      await useCooldown(tx, c.id, 'rally', cfg.rallyCooldownMinutes * 60_000);
      const energy = await spendEnergy(tx, c, ACTION_ENERGY.rally);
      const o = rallyOutcome(c.stats, freshRng());
      const stats = await applyMods(tx, c, o.mods);
      await audit(tx, { action: 'citizen.rally', actorUserId: c.user_id, actorCharacterId: c.id, details: { tag: o.tag }, ip: req.ip });
      if (o.tag === 'great') await publishNews(tx, { kind: 'rally', vars: { name: c.name, state: stateName(c.home_state_code) }, source: 'player', stateCode: c.home_state_code, actorId: c.id });
      return { outcome: { text: o.text, tag: o.tag, mods: o.mods }, stats, energy: Math.floor(energy) };
    });
  });

  // ---------- volunteer ----------
  app.post('/api/volunteer', async (req) => {
    const { role } = parseBody(z.object({ role: z.enum(['ward_agent', 'delegate']) }), req.body);
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const m = await tx.query<{ party_id: string }>('SELECT party_id FROM party_memberships WHERE character_id = $1 AND left_at IS NULL', [c.id]);
      const partyId = m.rows[0]?.party_id;
      if (!partyId) throw bad('not_member', 'Join a party before you volunteer.');
      try {
        await tx.query('INSERT INTO volunteer_roles (character_id, party_id, role) VALUES ($1, $2, $3)', [c.id, partyId, role]);
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw conflict('already_volunteering', 'You already hold that role.');
        throw e;
      }
      await applyMods(tx, c, { connections: 1 });
      await audit(tx, { action: 'citizen.volunteer', actorUserId: c.user_id, actorCharacterId: c.id, details: { role }, targetType: 'party', targetId: partyId, ip: req.ip });
      return { ok: true, role };
    });
  });

  app.delete('/api/volunteer/:role', async (req) => {
    const { role } = req.params as { role: string };
    const c = await requireCharacter(ctx, req);
    const r = await ctx.db.query('UPDATE volunteer_roles SET ended_at = now() WHERE character_id = $1 AND role = $2 AND ended_at IS NULL', [c.id, role]);
    if (!r.rowCount) throw notFound('You do not hold that role.');
    return { ok: true };
  });

  // ---------- petitions ----------
  app.get('/api/petitions', async (req) => {
    const viewer = req.user ? await ctx.db.query<{ id: string }>('SELECT id FROM characters WHERE user_id = $1', [req.user.id]) : null;
    const viewerId = viewer?.rows[0]?.id ?? null;
    const r = await ctx.db.query<{ id: string; title: string; body: string; state_code: string | null; created_at: Date; creator_name: string; signatures: number; signed: boolean }>(
      `SELECT p.id, p.title, p.body, p.state_code, p.created_at, c.name AS creator_name,
         (SELECT count(*)::int FROM petition_signatures s WHERE s.petition_id = p.id) AS signatures,
         EXISTS (SELECT 1 FROM petition_signatures s WHERE s.petition_id = p.id AND s.character_id = $1) AS signed
       FROM petitions p JOIN characters c ON c.id = p.creator_id ORDER BY p.created_at DESC LIMIT 50`,
      [viewerId],
    );
    return {
      petitions: r.rows.map((p) => ({ id: p.id, title: p.title, body: p.body, stateCode: p.state_code, createdAt: p.created_at, creatorName: p.creator_name, signatures: p.signatures, signed: p.signed })),
    };
  });

  app.post('/api/petitions', async (req, reply) => {
    const body = parseBody(z.object({ title: z.string().min(10, 'Title is too short').max(120), body: z.string().min(20, 'Explain the petition a bit more').max(2000), stateCode: z.string().length(2).optional() }), req.body);
    const title = cleanPublicText(body.title, 'Title');
    const text = cleanPublicText(body.body, 'Petition');
    const out = await ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      await useCooldown(tx, c.id, 'petition_create', 30 * 60_000);
      const r = await tx.query<{ id: string }>('INSERT INTO petitions (creator_id, title, body, state_code) VALUES ($1, $2, $3, $4) RETURNING id', [c.id, title, text, body.stateCode ?? null]);
      const id = (r.rows[0] as { id: string }).id;
      await tx.query('INSERT INTO petition_signatures (petition_id, character_id) VALUES ($1, $2)', [id, c.id]);
      await audit(tx, { action: 'citizen.petition_create', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'petition', targetId: id, ip: req.ip });
      await publishNews(tx, { kind: 'petition_created', vars: { title }, source: 'player', stateCode: body.stateCode ?? null, actorId: c.id });
      return { id };
    });
    return reply.code(201).send(out);
  });

  app.post('/api/petitions/:id/sign', async (req) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) throw notFound('No such petition.');
    const pending: NotificationRow[] = [];
    const out = await ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx);
      const p = await tx.query<{ id: string; title: string; creator_id: string }>('SELECT id, title, creator_id FROM petitions WHERE id = $1 FOR UPDATE', [id]);
      const pet = p.rows[0];
      if (!pet) throw notFound('No such petition.');
      const ins = await tx.query('INSERT INTO petition_signatures (petition_id, character_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, c.id]);
      if (!ins.rowCount) throw conflict('already_signed', 'You already signed this petition.');
      const n = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM petition_signatures WHERE petition_id = $1', [id]);
      const count = n.rows[0]?.n ?? 0;
      if (cfg.petitionMilestones.includes(count)) {
        await publishNews(tx, { kind: 'petition_milestone', vars: { title: pet.title, count }, source: 'player' });
        pending.push(await notify(tx, pet.creator_id, 'petition_milestone', `Your petition reached ${count} signatures`, pet.title));
      }
      await audit(tx, { action: 'citizen.petition_sign', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'petition', targetId: id, ip: req.ip });
      return { ok: true, signatures: count };
    });
    deliver(ctx.realtime, pending);
    return out;
  });

  // ---------- protests ----------
  app.get('/api/protests', async () => {
    const r = await ctx.db.query<{ id: string; state_code: string; issue: string; title: string; ends_at: Date; organiser_name: string; participants: number }>(
      `SELECT p.id, p.state_code, p.issue, p.title, p.ends_at, c.name AS organiser_name,
         (SELECT count(*)::int FROM protest_participants x WHERE x.protest_id = p.id) AS participants
       FROM protests p JOIN characters c ON c.id = p.organiser_id WHERE p.ends_at > now() ORDER BY p.created_at DESC LIMIT 50`,
    );
    return { protests: r.rows.map((p) => ({ id: p.id, stateCode: p.state_code, stateName: stateName(p.state_code), issue: p.issue, title: p.title, endsAt: p.ends_at, organiserName: p.organiser_name, participants: p.participants })) };
  });

  app.post('/api/protests', async (req, reply) => {
    const body = parseBody(z.object({ issue: z.enum(PROTEST_ISSUES), title: z.string().min(8, 'Title is too short').max(100) }), req.body);
    const title = cleanPublicText(body.title, 'Title');
    const out = await ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      await useCooldown(tx, c.id, 'protest_call', cfg.protestCooldownHours * 3_600_000);
      const ends = new Date(Date.now() + cfg.protestDurationHours * 3_600_000).toISOString();
      const r = await tx.query<{ id: string }>('INSERT INTO protests (organiser_id, state_code, issue, title, ends_at) VALUES ($1, $2, $3, $4, $5) RETURNING id', [c.id, c.home_state_code, body.issue, title, ends]);
      const id = (r.rows[0] as { id: string }).id;
      await audit(tx, { action: 'citizen.protest_call', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'protest', targetId: id, ip: req.ip });
      await publishNews(tx, { kind: 'protest_called', vars: { name: c.name, issue: body.issue.replace('_', ' '), state: stateName(c.home_state_code) }, source: 'player', stateCode: c.home_state_code, actorId: c.id });
      return { id };
    });
    return reply.code(201).send(out);
  });

  app.post('/api/protests/:id/join', async (req) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) throw notFound('No such protest.');
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const p = await tx.query<{ id: string; state_code: string; ends_at: Date }>('SELECT id, state_code, ends_at FROM protests WHERE id = $1', [id]);
      const protest = p.rows[0];
      if (!protest) throw notFound('No such protest.');
      if (new Date(protest.ends_at).getTime() <= Date.now()) throw bad('protest_over', 'This protest has ended.');
      const already = await tx.query('SELECT 1 FROM protest_participants WHERE protest_id = $1 AND character_id = $2', [id, c.id]);
      if (already.rows.length) throw conflict('already_joined', 'You are already at this protest.');
      await spendEnergy(tx, c, ACTION_ENERGY.protest);
      const st = await tx.query<{ profile: UnitProfile }>('SELECT profile FROM states WHERE code = $1', [protest.state_code]);
      const prof = st.rows[0]?.profile;
      const insecurity = prof ? INSECURITY_TYPES.reduce((s, t) => s + prof.insecurity[t], 0) / INSECURITY_TYPES.length : 30;
      const o = protestOutcome(c.stats, insecurity, freshRng());
      const stats = await applyMods(tx, c, o.mods);
      let fined = 0;
      if (o.cost > 0) {
        // the fine is capped at what you have; nobody goes negative
        const w = await tx.query<{ wallet: number }>('SELECT wallet FROM characters WHERE id = $1', [c.id]);
        fined = Math.min(o.cost, Number(w.rows[0]?.wallet ?? 0));
        if (fined > 0) await debit(tx, c.id, 'wallet', fined, 'protest_fine', { type: 'protest', id });
      }
      await tx.query('INSERT INTO protest_participants (protest_id, character_id, outcome) VALUES ($1, $2, $3)', [id, c.id, o.tag]);
      await audit(tx, { action: 'citizen.protest_join', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'protest', targetId: id, details: { tag: o.tag, fined }, ip: req.ip });
      return { outcome: { text: o.text, tag: o.tag, mods: o.mods, fined }, stats };
    });
  });

  // ---------- civic groups ----------
  app.post('/api/groups/:kind/join', async (req) => {
    const { kind } = req.params as { kind: string };
    if (!CIVIC_GROUPS.some((g) => g.kind === kind)) throw notFound('No such group.');
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const ins = await tx.query('INSERT INTO group_memberships (character_id, group_kind) VALUES ($1, $2) ON CONFLICT DO NOTHING', [c.id, kind]);
      if (!ins.rowCount) throw conflict('already_member', 'You are already in this group.');
      await applyMods(tx, c, { connections: 1 });
      await audit(tx, { action: 'citizen.group_join', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'group', targetId: kind, ip: req.ip });
      return { ok: true };
    });
  });

  app.post('/api/groups/:kind/leave', async (req) => {
    const { kind } = req.params as { kind: string };
    const c = await requireCharacter(ctx, req);
    const r = await ctx.db.query('UPDATE group_memberships SET left_at = now() WHERE character_id = $1 AND group_kind = $2 AND left_at IS NULL', [c.id, kind]);
    if (!r.rowCount) throw notFound('You are not in that group.');
    await audit(ctx.db, { action: 'citizen.group_leave', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'group', targetId: kind, ip: req.ip });
    return { ok: true };
  });
}
