// Chat: channel access rules, sending (mute, rate limit, filter, blocks), history, groups, blocks, reports.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { filterMessage } from '@avm/engine';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
import { audit } from '../audit.js';
import { GameError, bad, conflict, forbidden, notFound, requireCharacter, type CharacterRow } from './core.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CHANNEL_RE = new RegExp(`^(global|state:[A-Z]{2}|party:${UUID}|dm:${UUID}:${UUID}|group:${UUID})$`);

export function dmChannel(a: string, b: string): string {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export interface ChatMessage {
  id: number;
  channel: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: Date;
}

/** Whether `c` may read and post in `channel`. Throws GameError with the reason if not. */
export async function assertChannelAccess(db: Queryable, c: CharacterRow, channel: string): Promise<void> {
  if (!CHANNEL_RE.test(channel)) throw bad('bad_channel', 'Unknown channel.');
  const [kind, a, b] = channel.split(':') as [string, string?, string?];
  switch (kind) {
    case 'global':
      return;
    case 'state':
      if (a !== c.home_state_code) throw forbidden('You can only chat in your home state channel.');
      return;
    case 'party': {
      const r = await db.query('SELECT 1 FROM party_memberships WHERE character_id = $1 AND party_id = $2 AND left_at IS NULL', [c.id, a]);
      if (!r.rows.length) throw forbidden('Party chat is for members only.');
      return;
    }
    case 'dm': {
      if (channel !== dmChannel(a as string, b as string)) throw bad('bad_channel', 'Unknown channel.');
      if (a !== c.id && b !== c.id) throw forbidden('Not your conversation.');
      return;
    }
    case 'group': {
      const r = await db.query('SELECT 1 FROM chat_group_members WHERE group_id = $1 AND character_id = $2', [a, c.id]);
      if (!r.rows.length) throw forbidden('You are not in this group.');
      return;
    }
  }
  throw bad('bad_channel', 'Unknown channel.');
}

/** IDs of characters who have blocked `senderId` (they must not receive the sender's messages). */
export async function blockersOf(db: Queryable, senderId: string): Promise<Set<string>> {
  const r = await db.query<{ blocker_id: string }>('SELECT blocker_id FROM chat_blocks WHERE blocked_id = $1', [senderId]);
  return new Set(r.rows.map((x) => x.blocker_id));
}

/** Validate and store a message. The caller broadcasts it. */
export async function sendMessage(ctx: AppContext, c: CharacterRow, channel: string, rawBody: string): Promise<ChatMessage> {
  await assertChannelAccess(ctx.db, c, channel);
  const u = await ctx.db.query<{ muted_until: Date | null }>('SELECT muted_until FROM users WHERE id = $1', [c.user_id]);
  const muted = u.rows[0]?.muted_until;
  if (muted && new Date(muted).getTime() > Date.now()) throw forbidden('You are muted.');
  if (channel.startsWith('dm:')) {
    const other = channel.split(':').slice(1).find((id) => id !== c.id);
    const blocked = await ctx.db.query('SELECT 1 FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2', [other, c.id]);
    if (blocked.rows.length) throw forbidden('This person has blocked you.');
  }
  const window = Math.floor(Date.now() / 10_000);
  const count = await ctx.kv.incr(`chat:rate:${c.id}:${window}`, 20);
  if (count > ctx.game.chat.messagesPer10s) throw new GameError(429, 'rate_limited', 'You are sending messages too fast. Slow down small.');
  const f = filterMessage(rawBody);
  if (!f.ok) throw bad('rejected_message', f.reason);
  const r = await ctx.db.query<{ id: number; created_at: Date }>('INSERT INTO chat_messages (channel, sender_id, body, filtered) VALUES ($1, $2, $3, $4) RETURNING id, created_at', [channel, c.id, f.text, f.masked]);
  const row = r.rows[0] as { id: number; created_at: Date };
  return { id: row.id, channel, senderId: c.id, senderName: c.name, body: f.text, createdAt: row.created_at };
}

export async function history(ctx: AppContext, c: CharacterRow, channel: string, before?: number): Promise<ChatMessage[]> {
  await assertChannelAccess(ctx.db, c, channel);
  const r = await ctx.db.query<{ id: number; sender_id: string; sender_name: string; body: string; created_at: Date }>(
    `SELECT m.id, m.sender_id, ch.name AS sender_name, m.body, m.created_at
     FROM chat_messages m JOIN characters ch ON ch.id = m.sender_id
     WHERE m.channel = $1 AND m.hidden_at IS NULL AND ($2::bigint IS NULL OR m.id < $2)
       AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.blocker_id = $3 AND b.blocked_id = m.sender_id)
     ORDER BY m.id DESC LIMIT $4`,
    [channel, before ?? null, c.id, ctx.game.chat.historyLimit],
  );
  return r.rows.reverse().map((m) => ({ id: m.id, channel, senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at }));
}

export function registerChatRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/chat/channels', async (req) => {
    const c = await requireCharacter(ctx, req);
    const [party, groups, dms] = await Promise.all([
      ctx.db.query<{ id: string; name: string }>('SELECT p.id, p.name FROM party_memberships m JOIN parties p ON p.id = m.party_id WHERE m.character_id = $1 AND m.left_at IS NULL', [c.id]),
      ctx.db.query<{ id: string; name: string }>('SELECT g.id, g.name FROM chat_group_members gm JOIN chat_groups g ON g.id = gm.group_id WHERE gm.character_id = $1 ORDER BY g.name', [c.id]),
      ctx.db.query<{ channel: string }>("SELECT DISTINCT channel FROM chat_messages WHERE channel LIKE 'dm:%' AND channel LIKE '%' || $1 || '%'", [c.id]),
    ]);
    const dmIds = dms.rows.map((d) => d.channel.split(':').slice(1).find((id) => id !== c.id) as string);
    const names = dmIds.length ? await ctx.db.query<{ id: string; name: string }>('SELECT id, name FROM characters WHERE id = ANY($1::uuid[])', [dmIds]) : { rows: [] };
    const nameOf = new Map(names.rows.map((n) => [n.id, n.name]));
    return {
      channels: [
        { id: 'global', label: 'Naija (global)' },
        { id: `state:${c.home_state_code}`, label: `${c.home_state_code} state` },
        ...party.rows.map((p) => ({ id: `party:${p.id}`, label: `${p.name}` })),
        ...groups.rows.map((g) => ({ id: `group:${g.id}`, label: g.name })),
        ...dmIds.map((id) => ({ id: dmChannel(c.id, id), label: `DM: ${nameOf.get(id) ?? 'Unknown'}` })),
      ],
    };
  });

  app.get('/api/chat/messages', async (req) => {
    const q = z.object({ channel: z.string(), before: z.coerce.number().int().positive().optional() }).safeParse(req.query);
    if (!q.success) throw bad('invalid_input', 'Missing channel.');
    const c = await requireCharacter(ctx, req);
    return { messages: await history(ctx, c, q.data.channel, q.data.before) };
  });

  app.post('/api/chat/dm', async (req) => {
    const p = z.object({ characterId: z.string().regex(new RegExp(`^${UUID}$`)) }).safeParse(req.body);
    if (!p.success) throw bad('invalid_input', 'Pick someone to message.');
    const c = await requireCharacter(ctx, req);
    if (p.data.characterId === c.id) throw bad('self_dm', 'You cannot message yourself.');
    const t = await ctx.db.query('SELECT 1 FROM characters WHERE id = $1', [p.data.characterId]);
    if (!t.rows.length) throw notFound('No such player.');
    return { channel: dmChannel(c.id, p.data.characterId) };
  });

  app.post('/api/chat/groups', async (req, reply) => {
    const p = z.object({ name: z.string().trim().min(3).max(40), memberIds: z.array(z.string().regex(new RegExp(`^${UUID}$`))).max(50) }).safeParse(req.body);
    if (!p.success) throw bad('invalid_input', 'Give the group a name (3-40 characters).');
    const f = filterMessage(p.data.name);
    if (!f.ok || f.masked) throw bad('rejected_text', 'Pick a cleaner group name.');
    const out = await ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx);
      const g = await tx.query<{ id: string }>('INSERT INTO chat_groups (name, owner_id) VALUES ($1, $2) RETURNING id', [p.data.name, c.id]);
      const id = (g.rows[0] as { id: string }).id;
      const members = [...new Set([c.id, ...p.data.memberIds])];
      await tx.query('INSERT INTO chat_group_members (group_id, character_id) SELECT $1, id FROM characters WHERE id = ANY($2::uuid[])', [id, members]);
      return { channel: `group:${id}` };
    });
    return reply.code(201).send(out);
  });

  app.post('/api/chat/blocks', async (req) => {
    const p = z.object({ characterId: z.string().regex(new RegExp(`^${UUID}$`)) }).safeParse(req.body);
    if (!p.success) throw bad('invalid_input', 'Pick someone to block.');
    const c = await requireCharacter(ctx, req);
    if (p.data.characterId === c.id) throw bad('self_block', 'You cannot block yourself.');
    const r = await ctx.db.query('INSERT INTO chat_blocks (blocker_id, blocked_id) SELECT $1, id FROM characters WHERE id = $2 ON CONFLICT DO NOTHING', [c.id, p.data.characterId]);
    if (!r.rowCount) throw conflict('already_blocked', 'Already blocked (or no such player).');
    await audit(ctx.db, { action: 'chat.block', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'character', targetId: p.data.characterId, ip: req.ip });
    return { ok: true };
  });

  app.delete('/api/chat/blocks/:id', async (req) => {
    const { id } = req.params as { id: string };
    const c = await requireCharacter(ctx, req);
    await ctx.db.query('DELETE FROM chat_blocks WHERE blocker_id = $1 AND blocked_id::text = $2', [c.id, id]);
    return { ok: true };
  });

  app.post('/api/reports', async (req, reply) => {
    const p = z
      .object({ targetType: z.enum(['character', 'chat_message', 'petition', 'story']), targetId: z.string().min(1).max(64), reason: z.string().trim().min(5, 'Say briefly what is wrong').max(500) })
      .safeParse(req.body);
    if (!p.success) throw bad('invalid_input', p.error.issues[0]?.message ?? 'Invalid report.');
    const c = await requireCharacter(ctx, req);
    const r = await ctx.db.query<{ id: number }>('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4) RETURNING id', [c.id, p.data.targetType, p.data.targetId, p.data.reason]);
    await audit(ctx.db, { action: 'report.create', actorUserId: c.user_id, actorCharacterId: c.id, targetType: p.data.targetType, targetId: p.data.targetId, ip: req.ip });
    return reply.code(201).send({ id: r.rows[0]?.id });
  });
}
