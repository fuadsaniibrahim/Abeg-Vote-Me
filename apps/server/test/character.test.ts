import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BACKGROUNDS } from '@avm/engine';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { SESSION_COOKIE } from '../src/auth/routes.js';
import { cookieFrom, createTestContext } from './helpers.js';
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

const valid = { name: 'Chidi Nwosu', gender: 'male', age: 40, homeStateCode: 'EN', homeLgaId: 'EN-004', background: 'businessperson', traits: ['silver_tongue', 'deep_pockets'] };

async function registerOnly(email: string) {
  const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'test-password-1', acceptTerms: true } });
  return { cookie: cookieFrom(reg.headers['set-cookie'], SESSION_COOKIE) as string, id: reg.json().user.id as string };
}

describe('character creation', () => {
  it('requires a verified email', async () => {
    const u = await registerOnly('unverified@test.ng');
    const res = await app.inject({ method: 'POST', url: '/api/characters', payload: valid, headers: { cookie: u.cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('creates a character with engine-computed stats and starting money', async () => {
    const u = await registerOnly('creator@test.ng');
    await ctx.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [u.id]);
    const res = await app.inject({ method: 'POST', url: '/api/characters', payload: valid, headers: { cookie: u.cookie } });
    expect(res.statusCode).toBe(201);
    const c = res.json().character;
    expect(c).toMatchObject({ name: 'Chidi Nwosu', homeStateName: 'Enugu', homeLgaName: 'Enugu North', background: 'businessperson', warChest: 0 });
    expect(c.stats.charisma).toBe(BACKGROUNDS.businessperson.stats.charisma + 10);
    expect(c.wallet).toBe(BACKGROUNDS.businessperson.startingWallet + 3_000_000);
    expect(c.energy).toBe(100);
    const tx = await ctx.db.query("SELECT delta FROM transactions WHERE character_id = $1 AND reason = 'starting_funds'", [c.id]);
    expect(Number((tx.rows[0] as { delta: number }).delta)).toBe(c.wallet);
    const news = await ctx.db.query("SELECT headline FROM news_items WHERE kind = 'character_created' AND actor_character_id = $1", [c.id]);
    expect(news.rows).toHaveLength(1);
    const a = await ctx.db.query("SELECT 1 FROM audit_log WHERE action = 'character.create' AND actor_character_id = $1", [c.id]);
    expect(a.rows).toHaveLength(1);

    // one character per account
    const again = await app.inject({ method: 'POST', url: '/api/characters', payload: { ...valid, name: 'Second Try' }, headers: { cookie: u.cookie } });
    expect(again.statusCode).toBe(409);
  });

  it('rejects invalid characters with per-field errors and never trusts client stats', async () => {
    const u = await registerOnly('invalid@test.ng');
    await ctx.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [u.id]);
    const res = await app.inject({ method: 'POST', url: '/api/characters', payload: { ...valid, age: 70, traits: ['clean_hands', 'smooth_operator'] }, headers: { cookie: u.cookie } });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().fields).sort()).toEqual(['age', 'traits']);
    const sneaky = await app.inject({ method: 'POST', url: '/api/characters', payload: { ...valid, stats: { charisma: 100 }, wallet: 1e12 }, headers: { cookie: u.cookie } });
    expect(sneaky.statusCode).toBe(201);
    expect(sneaky.json().character.stats.charisma).toBe(BACKGROUNDS.businessperson.stats.charisma + 10);
    expect(sneaky.json().character.wallet).toBeLessThan(1e9);
  });
});

describe('profile endpoints', () => {
  it('/api/me/character returns the full profile; 409 before a character exists', async () => {
    const u = await registerOnly('nochar@test.ng');
    await ctx.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [u.id]);
    expect((await app.inject({ method: 'GET', url: '/api/me/character', headers: { cookie: u.cookie } })).statusCode).toBe(409);
    const p = await makePlayer(app, ctx);
    const me = await p.call('GET', '/api/me/character');
    expect(me.status).toBe(200);
    expect(me.body.character).toMatchObject({ id: p.characterId, party: null, office: null, groups: [], volunteerRoles: [] });
  });

  it('public profile hides money and hidden stats', async () => {
    const p = await makePlayer(app, ctx);
    const res = await app.inject({ method: 'GET', url: `/api/characters/${p.characterId}` });
    const c = res.json().character;
    expect(c.name).toBe(p.name);
    expect(c.wallet).toBeUndefined();
    expect(c.stats).toBeUndefined();
    expect(c.publicImage).toBeTypeOf('number');
  });

  it('search finds characters by name', async () => {
    const p = await makePlayer(app, ctx, { name: 'Zainab Searchable' });
    const res = await app.inject({ method: 'GET', url: '/api/characters?q=searchab' });
    expect(res.json().characters.map((c: { id: string }) => c.id)).toContain(p.characterId);
  });

  it('world clock reports the in-game date', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/world/clock' });
    expect(res.statusCode).toBe(200);
    expect(res.json().date).toMatchObject({ year: 2027, month: 1, monthsElapsed: 0 });
  });
});
