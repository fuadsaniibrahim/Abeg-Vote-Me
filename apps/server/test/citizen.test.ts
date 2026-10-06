import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { createTestContext } from './helpers.js';
import { makePlayer, walletOf, type TestPlayer } from './players.js';

let ctx: AppContext;
let app: FastifyInstance;
beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
  ctx.game = {
    ...ctx.game,
    rateLimits: { ...ctx.game.rateLimits, authPerMinute: 10_000 },
    citizen: { ...ctx.game.citizen, petitionMilestones: [2, 3] },
  };
  app = await buildApp(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.db.close();
});

const audits = async (action: string, characterId: string) =>
  (await ctx.db.query('SELECT details FROM audit_log WHERE action = $1 AND actor_character_id = $2', [action, characterId])).rows as { details: Record<string, unknown> }[];

describe('parties', () => {
  it('lists the fictional parties with seat counts covering every seat', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/parties' });
    const parties = res.json().parties as { code: string; seatsHeld: number; playerMembers: number }[];
    expect(parties.map((p) => p.code).sort()).toEqual(['IND', 'LF', 'NDA', 'PRM', 'PUP']);
    const seats = (await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM seats')).rows[0]!.n;
    expect(seats).toBeGreaterThan(1317); // includes ward seats
    expect(parties.reduce((s, p) => s + p.seatsHeld, 0)).toBe(seats);
  });

  it('join one party at a time; leaving starts a rejoin cooldown', async () => {
    const p = await makePlayer(app, ctx);
    expect((await p.call('POST', '/api/parties/PUP/join')).status).toBe(200);
    expect((await p.call('POST', '/api/parties/NDA/join')).body.error).toBe('already_member');
    expect((await p.call('POST', '/api/parties/IND/join')).status).toBe(400);
    expect((await p.call('POST', '/api/parties/XYZ/join')).status).toBe(404);
    expect((await p.call('GET', '/api/me/character')).body.character.party.code).toBe('PUP');

    expect((await p.call('POST', '/api/parties/leave')).status).toBe(200);
    expect((await p.call('POST', '/api/parties/leave')).body.error).toBe('not_member');
    const blocked = await p.call('POST', '/api/parties/NDA/join');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Wait/);

    // pretend the cooldown passed
    await ctx.db.query("UPDATE party_memberships SET left_at = now() - interval '25 hours' WHERE character_id = $1", [p.characterId]);
    expect((await p.call('POST', '/api/parties/NDA/join')).status).toBe(200);
    expect(await audits('party.join', p.characterId)).toHaveLength(2);
    expect(await audits('party.leave', p.characterId)).toHaveLength(1);
  });

  it('joined party counts as a player member', async () => {
    const before = (await app.inject({ method: 'GET', url: '/api/parties' })).json().parties.find((x: { code: string }) => x.code === 'LF').playerMembers;
    const p = await makePlayer(app, ctx);
    await p.call('POST', '/api/parties/LF/join');
    const after = (await app.inject({ method: 'GET', url: '/api/parties' })).json().parties.find((x: { code: string }) => x.code === 'LF').playerMembers;
    expect(after).toBe(before + 1);
  });
});

describe('donations', () => {
  let donor: TestPlayer;
  let candidate: TestPlayer;
  beforeAll(async () => {
    donor = await makePlayer(app, ctx);
    candidate = await makePlayer(app, ctx);
  });

  it('donating to a party moves money from wallet to the party treasury atomically', async () => {
    const before = await walletOf(ctx, donor.characterId);
    const t0 = Number((await ctx.db.query<{ treasury: number }>("SELECT treasury FROM parties WHERE code = 'PRM'")).rows[0]!.treasury);
    const res = await donor.call('POST', '/api/donations', { recipientType: 'party', recipientId: 'PRM', amount: 250_000 });
    expect(res.status).toBe(200);
    expect((await walletOf(ctx, donor.characterId)).wallet).toBe(before.wallet - 250_000);
    const t1 = Number((await ctx.db.query<{ treasury: number }>("SELECT treasury FROM parties WHERE code = 'PRM'")).rows[0]!.treasury);
    expect(t1 - t0).toBe(250_000);
    expect((await audits('money.donate', donor.characterId))[0]!.details).toEqual({ amount: 250_000 });
  });

  it('donating to a candidate fills their war chest (not wallet) and notifies them', async () => {
    const before = await walletOf(ctx, candidate.characterId);
    const res = await donor.call('POST', '/api/donations', { recipientType: 'candidate', recipientId: candidate.characterId, amount: 100_000 });
    expect(res.status).toBe(200);
    const after = await walletOf(ctx, candidate.characterId);
    expect(after.warChest - before.warChest).toBe(100_000);
    expect(after.wallet).toBe(before.wallet);
    const notes = await candidate.call('GET', '/api/notifications');
    expect(notes.body.notifications[0].kind).toBe('donation');
  });

  it('rejects overdrafts without changing any balance', async () => {
    const poor = await makePlayer(app, ctx);
    await ctx.db.query('UPDATE characters SET wallet = 5000 WHERE id = $1', [poor.characterId]);
    const candBefore = await walletOf(ctx, candidate.characterId);
    const res = await poor.call('POST', '/api/donations', { recipientType: 'candidate', recipientId: candidate.characterId, amount: 6000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('insufficient_funds');
    expect(await walletOf(ctx, poor.characterId)).toEqual({ wallet: 5000, warChest: 0 });
    expect(await walletOf(ctx, candidate.characterId)).toEqual(candBefore);
  });

  it('enforces min/max donation, no self-donation and no unknown recipients', async () => {
    expect((await donor.call('POST', '/api/donations', { recipientType: 'party', recipientId: 'PUP', amount: 999 })).status).toBe(400);
    expect((await donor.call('POST', '/api/donations', { recipientType: 'party', recipientId: 'PUP', amount: 50_000_001 })).status).toBe(400);
    expect((await donor.call('POST', '/api/donations', { recipientType: 'candidate', recipientId: donor.characterId, amount: 5000 })).body.error).toBe('self_donation');
    expect((await donor.call('POST', '/api/donations', { recipientType: 'party', recipientId: 'IND', amount: 5000 })).status).toBe(404);
  });
});

describe('rally', () => {
  it('costs energy, changes stats a little, and has a cooldown', async () => {
    const p = await makePlayer(app, ctx);
    const r = await p.call('POST', '/api/actions/rally');
    expect(r.status).toBe(200);
    expect(r.body.energy).toBe(85);
    expect(['rain', 'good', 'great']).toContain(r.body.outcome.tag);
    const again = await p.call('POST', '/api/actions/rally');
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('cooldown');
  });

  it('refuses when too tired, and a refused action does not start the cooldown', async () => {
    const p = await makePlayer(app, ctx);
    await ctx.db.query('UPDATE characters SET energy = 5, energy_updated_at = now() WHERE id = $1', [p.characterId]);
    const r = await p.call('POST', '/api/actions/rally');
    expect(r.body.error).toBe('tired');
    const log = await ctx.db.query("SELECT 1 FROM action_log WHERE character_id = $1 AND kind = 'rally'", [p.characterId]);
    expect(log.rows).toHaveLength(0);
  });
});

describe('volunteering', () => {
  it('needs a party, one role of each kind, and ends when you leave the party', async () => {
    const p = await makePlayer(app, ctx);
    expect((await p.call('POST', '/api/volunteer', { role: 'delegate' })).body.error).toBe('not_member');
    await p.call('POST', '/api/parties/PUP/join');
    expect((await p.call('POST', '/api/volunteer', { role: 'delegate' })).status).toBe(200);
    expect((await p.call('POST', '/api/volunteer', { role: 'delegate' })).body.error).toBe('already_volunteering');
    expect((await p.call('POST', '/api/volunteer', { role: 'ward_agent' })).status).toBe(200);
    expect((await p.call('GET', '/api/me/character')).body.character.volunteerRoles).toEqual(['delegate', 'ward_agent']);
    await p.call('POST', '/api/parties/leave');
    expect((await p.call('GET', '/api/me/character')).body.character.volunteerRoles).toEqual([]);
  });
});

describe('petitions', () => {
  it('create (auto-signed), sign once, milestone news and notification', async () => {
    const a = await makePlayer(app, ctx);
    const b = await makePlayer(app, ctx);
    const c = await makePlayer(app, ctx);
    const created = await a.call('POST', '/api/petitions', { title: 'Fix the Third Mainland Bridge', body: 'The bridge don old and we need urgent repairs before e too late.' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await a.call('POST', `/api/petitions/${id}/sign`)).body.error).toBe('already_signed');
    expect((await b.call('POST', `/api/petitions/${id}/sign`)).body.signatures).toBe(2);
    expect((await b.call('POST', `/api/petitions/${id}/sign`)).status).toBe(409);
    expect((await c.call('POST', `/api/petitions/${id}/sign`)).body.signatures).toBe(3);
    const news = await ctx.db.query("SELECT headline FROM news_items WHERE kind = 'petition_milestone'");
    expect(news.rows.length).toBeGreaterThanOrEqual(2);
    const notes = (await a.call('GET', '/api/notifications')).body.notifications;
    expect(notes.filter((n: { kind: string }) => n.kind === 'petition_milestone')).toHaveLength(2);
    const list = (await b.call('GET', '/api/petitions')).body.petitions.find((p: { id: string }) => p.id === id);
    expect(list).toMatchObject({ signatures: 3, signed: true, creatorName: a.name });
  });

  it('filters public text: rejects incitement and real politicians, masks profanity', async () => {
    const p = await makePlayer(app, ctx);
    expect((await p.call('POST', '/api/petitions', { title: 'Burn their village down now', body: 'This is a long enough body for the petition text.' })).body.error).toBe('rejected_text');
    await ctx.db.query('DELETE FROM action_log WHERE character_id = $1', [p.characterId]);
    expect((await p.call('POST', '/api/petitions', { title: 'Make Tinubu fix our roads', body: 'This is a long enough body for the petition text.' })).body.error).toBe('real_person');
    await ctx.db.query('DELETE FROM action_log WHERE character_id = $1', [p.characterId]);
    const ok = await p.call('POST', '/api/petitions', { title: 'This shit road must be fixed', body: 'This is a long enough body for the petition text.' });
    expect(ok.status).toBe(201);
    const row = await ctx.db.query<{ title: string }>('SELECT title FROM petitions WHERE id = $1', [ok.body.id]);
    expect(row.rows[0]!.title).toBe('This s*** road must be fixed');
  });
});

describe('protests', () => {
  it('call a protest in your home state, join once, outcome applied, fine never overdraws', async () => {
    const org = await makePlayer(app, ctx, { homeStateCode: 'KN', homeLgaId: 'KN-021' });
    const joiner = await makePlayer(app, ctx);
    const created = await org.call('POST', '/api/protests', { issue: 'fuel_price', title: 'End the fuel price wahala' });
    expect(created.status).toBe(201);
    const list = (await joiner.call('GET', '/api/protests')).body.protests;
    expect(list.find((p: { id: string }) => p.id === created.body.id)).toMatchObject({ stateCode: 'KN', issue: 'fuel_price' });

    await ctx.db.query('UPDATE characters SET wallet = 10 WHERE id = $1', [joiner.characterId]);
    const r = await joiner.call('POST', `/api/protests/${created.body.id}/join`);
    expect(r.status).toBe(200);
    expect(['peaceful', 'teargas', 'detained']).toContain(r.body.outcome.tag);
    expect(r.body.outcome.fined).toBeLessThanOrEqual(10);
    expect((await walletOf(ctx, joiner.characterId)).wallet).toBeGreaterThanOrEqual(0);
    expect((await joiner.call('POST', `/api/protests/${created.body.id}/join`)).body.error).toBe('already_joined');
    expect((await org.call('POST', '/api/protests', { issue: 'jobs', title: 'Another protest today' })).status).toBe(429);
  });

  it('cannot join an ended protest', async () => {
    const org = await makePlayer(app, ctx);
    const j = await makePlayer(app, ctx);
    const created = await org.call('POST', '/api/protests', { issue: 'power', title: 'We want light, abeg' });
    await ctx.db.query("UPDATE protests SET ends_at = now() - interval '1 minute' WHERE id = $1", [created.body.id]);
    expect((await j.call('POST', `/api/protests/${created.body.id}/join`)).body.error).toBe('protest_over');
  });
});

describe('civic groups', () => {
  it('join labour, student, trade or community watch; no duplicates; leave', async () => {
    const p = await makePlayer(app, ctx);
    for (const g of ['labour', 'student', 'trade', 'community_watch']) expect((await p.call('POST', `/api/groups/${g}/join`)).status).toBe(200);
    expect((await p.call('POST', '/api/groups/labour/join')).status).toBe(409);
    expect((await p.call('POST', '/api/groups/pirates/join')).status).toBe(404);
    expect((await p.call('GET', '/api/me/character')).body.character.groups).toEqual(['community_watch', 'labour', 'student', 'trade']);
    expect((await p.call('POST', '/api/groups/student/leave')).status).toBe(200);
    expect((await p.call('POST', '/api/groups/student/leave')).status).toBe(404);
  });
});
