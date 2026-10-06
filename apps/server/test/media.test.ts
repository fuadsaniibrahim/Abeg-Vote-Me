import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { REP_GAIN_TRUE, REP_LOSS_FALSE } from '../src/game/media.js';
import { headlineFor } from '../src/game/news.js';
import { Rng } from '@avm/engine';
import { NEWS_TEMPLATES } from '@avm/data';
import { createTestContext } from './helpers.js';
import { makePlayer } from './players.js';

let ctx: AppContext;
let app: FastifyInstance;
beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 10_000 } };
  app = await buildApp(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.db.close();
});

describe('Naija Daily headlines', () => {
  it('every template kind renders without missing variables', () => {
    const vars = { name: 'Ada Obi', lga: 'Ikeja', state: 'Lagos', party: 'PUP', amount: '₦1,000,000', recipient: 'PUP', sector: 'shop', title: 'Fix roads', count: 10, issue: 'fuel', inflation: '20.1', fuel: '₦650', fx: '₦1,450', seat: 'Governor of Lagos State', office: 'Governor' };
    for (const kind of Object.keys(NEWS_TEMPLATES)) {
      for (let i = 0; i < 20; i++) expect(headlineFor(kind, vars, new Rng(`${kind}${i}`)), kind).not.toMatch(/[{}]/);
    }
  });

  it('player actions appear in the news feed, newest first, filterable by state', async () => {
    const lagos = await makePlayer(app, ctx, { homeStateCode: 'LA', homeLgaId: 'LA-001' });
    const kano = await makePlayer(app, ctx, { homeStateCode: 'KN', homeLgaId: 'KN-001' });
    await lagos.call('POST', '/api/parties/PRM/join');
    const all = (await app.inject({ method: 'GET', url: '/api/news' })).json().items as { kind: string; actorId: string; stateCode: string }[];
    expect(all[0]).toMatchObject({ kind: 'party_joined', actorId: lagos.characterId });
    const kanoFeed = (await app.inject({ method: 'GET', url: '/api/news?state=KN' })).json().items as { stateCode: string | null; actorId: string }[];
    expect(kanoFeed.every((n) => n.stateCode === 'KN' || n.stateCode === null)).toBe(true);
    expect(kanoFeed.some((n) => n.actorId === kano.characterId)).toBe(true);
  });
});

describe('journalist stories', () => {
  it('accurate story raises reputation; false story lowers it more; target is notified; accuracy stays hidden', async () => {
    const reporter = await makePlayer(app, ctx);
    const target = await makePlayer(app, ctx);
    await target.call('POST', '/api/parties/PUP/join');

    const truth = await reporter.call('POST', '/api/stories', { targetId: target.characterId, claim: 'member_of_party', partyCode: 'PUP' });
    expect(truth.status).toBe(201);
    expect(truth.body.journalistRep).toBe(50 + REP_GAIN_TRUE);
    expect(truth.body.accurate).toBeUndefined();
    expect((await ctx.db.query<{ accurate: boolean }>('SELECT accurate FROM stories WHERE id = $1', [truth.body.id])).rows[0]!.accurate).toBe(true);

    await ctx.db.query("DELETE FROM action_log WHERE character_id = $1 AND kind = 'story'", [reporter.characterId]);
    const lie = await reporter.call('POST', '/api/stories', { targetId: target.characterId, claim: 'owns_business' });
    expect(lie.body.journalistRep).toBe(50 + REP_GAIN_TRUE - REP_LOSS_FALSE);
    expect((await ctx.db.query<{ accurate: boolean }>('SELECT accurate FROM stories WHERE id = $1', [lie.body.id])).rows[0]!.accurate).toBe(false);

    const notes = (await target.call('GET', '/api/notifications')).body.notifications.filter((n: { kind: string }) => n.kind === 'story_about_you');
    expect(notes).toHaveLength(2);
    const pub = (await app.inject({ method: 'GET', url: `/api/stories/${lie.body.id}` })).json().story;
    expect(pub.accurate).toBeUndefined();
  });

  it('claims are checked against game records (donation, business, protest)', async () => {
    const reporter = await makePlayer(app, ctx);
    const target = await makePlayer(app, ctx);
    await target.call('POST', '/api/donations', { recipientType: 'party', recipientId: 'NDA', amount: 5000 });
    await target.call('POST', '/api/businesses', { name: 'Quiet Kiosk', sector: 'pos', capital: 200_000 });
    const results: boolean[] = [];
    for (const [claim, partyCode] of [['donated_to_party', 'NDA'], ['donated_to_party', 'PUP'], ['owns_business', undefined], ['joined_protest', undefined]] as const) {
      await ctx.db.query("DELETE FROM action_log WHERE character_id = $1 AND kind = 'story'", [reporter.characterId]);
      await ctx.db.query('UPDATE characters SET energy = 100 WHERE id = $1', [reporter.characterId]);
      const r = await reporter.call('POST', '/api/stories', { targetId: target.characterId, claim, partyCode });
      results.push((await ctx.db.query<{ accurate: boolean }>('SELECT accurate FROM stories WHERE id = $1', [r.body.id])).rows[0]!.accurate);
    }
    expect(results).toEqual([true, false, true, false]);
  });

  it('cooldown, energy and no self-stories', async () => {
    const reporter = await makePlayer(app, ctx);
    const target = await makePlayer(app, ctx);
    expect((await reporter.call('POST', '/api/stories', { targetId: reporter.characterId, claim: 'owns_business' })).body.error).toBe('self_story');
    expect((await reporter.call('POST', '/api/stories', { targetId: target.characterId, claim: 'owns_business' })).status).toBe(201);
    expect((await reporter.call('POST', '/api/stories', { targetId: target.characterId, claim: 'owns_business' })).status).toBe(429);
    expect((await reporter.call('POST', '/api/stories', { targetId: target.characterId, claim: 'member_of_party' })).status).toBe(400);
  });
});

describe('notifications', () => {
  it('mark one or all as read', async () => {
    const a = await makePlayer(app, ctx);
    const b = await makePlayer(app, ctx);
    await b.call('POST', '/api/donations', { recipientType: 'candidate', recipientId: a.characterId, amount: 2000 });
    await b.call('POST', '/api/donations', { recipientType: 'candidate', recipientId: a.characterId, amount: 3000 });
    const list = (await a.call('GET', '/api/notifications')).body.notifications;
    expect(list).toHaveLength(2);
    expect((await a.call('GET', '/api/me/character')).body.character.unreadNotifications).toBe(2);
    expect((await a.call('POST', '/api/notifications/read', { ids: [list[0].id] })).body.marked).toBe(1);
    expect((await a.call('POST', '/api/notifications/read', {})).body.marked).toBe(1);
    expect((await a.call('GET', '/api/me/character')).body.character.unreadNotifications).toBe(0);
  });
});
