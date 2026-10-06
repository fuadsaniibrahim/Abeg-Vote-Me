// News feed, journalist stories, notifications.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACTION_ENERGY, clamp } from '@avm/engine';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
import { audit } from '../audit.js';
import { bad, lockCharacter, notFound, requireCharacter, spendEnergy, useCooldown } from './core.js';
import { deliver, notify } from './notify.js';

/**
 * Claims a journalist can make. Accuracy is decided from game records, so a story is true or false
 * no matter how it is worded. `param` is a party code where needed.
 */
export const STORY_CLAIMS = {
  member_of_party: { label: 'is a member of {party}', needsParty: true },
  donated_to_party: { label: 'has donated money to {party}', needsParty: true },
  owns_business: { label: 'secretly owns a business', needsParty: false },
  joined_protest: { label: 'took part in a street protest', needsParty: false },
} as const;
export type StoryClaim = keyof typeof STORY_CLAIMS;

export async function isClaimTrue(db: Queryable, targetId: string, claim: StoryClaim, partyId: string | null): Promise<boolean> {
  switch (claim) {
    case 'member_of_party':
      return (await db.query('SELECT 1 FROM party_memberships WHERE character_id = $1 AND party_id = $2 AND left_at IS NULL', [targetId, partyId])).rows.length > 0;
    case 'donated_to_party':
      return (await db.query("SELECT 1 FROM transactions WHERE character_id = $1 AND reason = 'donation_to_party' AND ref_id = $2::text", [targetId, partyId])).rows.length > 0;
    case 'owns_business':
      return (await db.query('SELECT 1 FROM businesses WHERE owner_id = $1 AND closed_at IS NULL', [targetId])).rows.length > 0;
    case 'joined_protest':
      return (await db.query('SELECT 1 FROM protest_participants WHERE character_id = $1', [targetId])).rows.length > 0;
  }
}

export const REP_GAIN_TRUE = 5;
export const REP_LOSS_FALSE = 12;

export function registerMediaRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/news', async (req) => {
    const q = z.object({ state: z.string().length(2).optional(), before: z.coerce.number().int().positive().optional() }).safeParse(req.query);
    if (!q.success) throw bad('invalid_input', 'Bad query.');
    const r = await ctx.db.query<{ id: number; kind: string; headline: string; body: string; state_code: string | null; source: string; created_at: Date; actor_name: string | null; actor_id: string | null }>(
      `SELECT n.id, n.kind, n.headline, n.body, n.state_code, n.source, n.created_at, c.name AS actor_name, c.id AS actor_id
       FROM news_items n LEFT JOIN characters c ON c.id = n.actor_character_id
       WHERE ($1::text IS NULL OR n.state_code = $1 OR n.state_code IS NULL) AND ($2::bigint IS NULL OR n.id < $2)
       ORDER BY n.id DESC LIMIT 30`,
      [q.data.state ?? null, q.data.before ?? null],
    );
    return {
      items: r.rows.map((n) => ({ id: n.id, kind: n.kind, headline: n.headline, body: n.body, stateCode: n.state_code, source: n.source, createdAt: n.created_at, actorName: n.actor_name, actorId: n.actor_id })),
    };
  });

  app.get('/api/stories/claims', async () => ({ claims: Object.entries(STORY_CLAIMS).map(([id, c]) => ({ id, label: c.label, needsParty: c.needsParty })) }));

  app.post('/api/stories', async (req, reply) => {
    const parsed = z
      .object({
        targetId: z.string().regex(/^[0-9a-f-]{36}$/),
        claim: z.enum(Object.keys(STORY_CLAIMS) as [StoryClaim, ...StoryClaim[]]),
        partyCode: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw bad('invalid_input', 'Pick a person and a claim.');
    const { targetId, claim, partyCode } = parsed.data;
    const pending: Awaited<ReturnType<typeof notify>>[] = [];
    const out = await ctx.db.transaction(async (tx) => {
      const author = await requireCharacter(ctx, req, tx, true);
      if (author.id === targetId) throw bad('self_story', 'You cannot write an exposé about yourself.');
      const target = await lockCharacter(tx, targetId);
      let partyId: string | null = null;
      let partyName = '';
      if (STORY_CLAIMS[claim].needsParty) {
        const p = await tx.query<{ id: string; name: string }>('SELECT id, name FROM parties WHERE code = $1', [partyCode ?? '']);
        if (!p.rows[0]) throw bad('invalid_party', 'Pick a party for this claim.');
        partyId = p.rows[0].id;
        partyName = p.rows[0].name;
      }
      await useCooldown(tx, author.id, 'story', ctx.game.citizen.storyCooldownHours * 3_600_000);
      await spendEnergy(tx, author, ACTION_ENERGY.story);
      const accurate = await isClaimTrue(tx, targetId, claim, partyId);
      const headline = `EXCLUSIVE: ${target.name} ${STORY_CLAIMS[claim].label.replace('{party}', partyName)}`;
      const body = `By ${author.name}. Sources tell Naija Daily that ${target.name} ${STORY_CLAIMS[claim].label.replace('{party}', partyName)}.`;
      const n = await tx.query<{ id: number }>("INSERT INTO news_items (kind, headline, body, state_code, actor_character_id, source) VALUES ('story', $1, $2, $3, $4, 'story') RETURNING id", [
        headline,
        body,
        target.home_state_code,
        author.id,
      ]);
      const newsId = (n.rows[0] as { id: number }).id;
      const s = await tx.query<{ id: string }>(
        'INSERT INTO stories (author_id, target_id, claim, claim_param, headline, body, accurate, news_item_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [author.id, targetId, claim, partyCode ?? null, headline, body, accurate, newsId],
      );
      const newRep = clamp(author.journalist_rep + (accurate ? REP_GAIN_TRUE : -REP_LOSS_FALSE), 0, 100);
      await tx.query('UPDATE characters SET journalist_rep = $2 WHERE id = $1', [author.id, newRep]);
      pending.push(await notify(tx, targetId, 'story_about_you', `${author.name} published a story about you`, headline));
      await audit(tx, { action: 'media.story_publish', actorUserId: author.user_id, actorCharacterId: author.id, targetType: 'character', targetId, details: { claim, partyCode, accurate }, ip: req.ip });
      // accuracy is not revealed to the author directly; they see their reputation move
      return { id: (s.rows[0] as { id: string }).id, headline, journalistRep: newRep };
    });
    deliver(ctx.realtime, pending);
    return reply.code(201).send(out);
  });

  // ---------- notifications ----------
  app.get('/api/notifications', async (req) => {
    const c = await requireCharacter(ctx, req);
    const r = await ctx.db.query('SELECT id, kind, title, body, read_at, created_at FROM notifications WHERE character_id = $1 ORDER BY id DESC LIMIT 50', [c.id]);
    return { notifications: r.rows };
  });

  app.post('/api/notifications/read', async (req) => {
    const c = await requireCharacter(ctx, req);
    const ids = z.object({ ids: z.array(z.number().int()).max(200).optional() }).safeParse(req.body ?? {});
    if (!ids.success) throw bad('invalid_input', 'Bad ids.');
    const r = ids.data.ids?.length
      ? await ctx.db.query('UPDATE notifications SET read_at = now() WHERE character_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL', [c.id, ids.data.ids])
      : await ctx.db.query('UPDATE notifications SET read_at = now() WHERE character_id = $1 AND read_at IS NULL', [c.id]);
    return { marked: r.rowCount };
  });

  app.get('/api/stories/:id', async (req) => {
    const { id } = req.params as { id: string };
    const r = await ctx.db.query<{ headline: string; body: string; published_at: Date; author_name: string; target_name: string }>(
      `SELECT s.headline, s.body, s.published_at, a.name AS author_name, t.name AS target_name
       FROM stories s JOIN characters a ON a.id = s.author_id JOIN characters t ON t.id = s.target_id WHERE s.id::text = $1`,
      [id],
    );
    if (!r.rows[0]) throw notFound('No such story.');
    return { story: r.rows[0] };
  });
}
