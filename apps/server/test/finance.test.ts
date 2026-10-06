import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { createTestContext } from './helpers.js';
import { makePlayer, walletOf } from './players.js';

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

describe('businesses', () => {
  it('starting a business debits the full capital and records it', async () => {
    const p = await makePlayer(app, ctx, { background: 'lawyer' });
    const before = await walletOf(ctx, p.characterId);
    const r = await p.call('POST', '/api/businesses', { name: 'Mama Put Deluxe', sector: 'restaurant', capital: 600_000 });
    expect(r.status).toBe(201);
    expect(r.body.cost).toBe(600_000);
    expect((await walletOf(ctx, p.characterId)).wallet).toBe(before.wallet - 600_000);
    const fin = (await p.call('GET', '/api/me/finance')).body;
    expect(fin.businesses).toHaveLength(1);
    expect(fin.businesses[0]).toMatchObject({ name: 'Mama Put Deluxe', sector: 'restaurant', capital: 600_000, earned: 0 });
    expect(fin.transactions[0]).toMatchObject({ reason: 'business_start', delta: -600_000, account: 'wallet' });
  });

  it('businessperson background perk gives 20% off', async () => {
    const p = await makePlayer(app, ctx, { background: 'businessperson' });
    const r = await p.call('POST', '/api/businesses', { name: 'Chop Life Ventures', sector: 'pos', capital: 1_000_000 });
    expect(r.body.cost).toBe(800_000);
  });

  it('enforces sector minimum capital, known sectors, funds and a 3-business limit', async () => {
    const p = await makePlayer(app, ctx, { background: 'businessperson' });
    expect((await p.call('POST', '/api/businesses', { name: 'Tiny Station', sector: 'filling_station', capital: 100_000 })).body.error).toBe('capital_too_low');
    expect((await p.call('POST', '/api/businesses', { name: 'Space Co', sector: 'rockets', capital: 1_000_000 })).body.error).toBe('invalid_sector');
    expect((await p.call('POST', '/api/businesses', { name: 'Too Big Estates', sector: 'real_estate', capital: 900_000_000 })).body.error).toBe('insufficient_funds');
    for (let i = 0; i < 3; i++) expect((await p.call('POST', '/api/businesses', { name: `Kiosk ${i + 1}`, sector: 'pos', capital: 200_000 })).status).toBe(201);
    expect((await p.call('POST', '/api/businesses', { name: 'Kiosk 4', sector: 'pos', capital: 200_000 })).body.error).toBe('too_many_businesses');
  });
});

describe('wallet and war chest transfers', () => {
  it('moves money both ways; war chest to wallet is flagged and audited', async () => {
    const p = await makePlayer(app, ctx);
    const start = await walletOf(ctx, p.characterId);
    const a = await p.call('POST', '/api/me/transfer', { from: 'wallet', to: 'warChest', amount: 100_000 });
    expect(a.body).toEqual({ wallet: start.wallet - 100_000, warChest: 100_000, flags: [] });
    const b = await p.call('POST', '/api/me/transfer', { from: 'warChest', to: 'wallet', amount: 40_000 });
    expect(b.body).toEqual({ wallet: start.wallet - 60_000, warChest: 60_000, flags: ['campaign_funds_diverted'] });
    const audit = await ctx.db.query<{ details: { flags: string[] } }>("SELECT details FROM audit_log WHERE action = 'money.transfer' AND actor_character_id = $1 ORDER BY id", [p.characterId]);
    expect(audit.rows.map((r) => r.details.flags)).toEqual([[], ['campaign_funds_diverted']]);
  });

  it('rejects overdraft and same-account transfers without changing balances', async () => {
    const p = await makePlayer(app, ctx);
    const start = await walletOf(ctx, p.characterId);
    expect((await p.call('POST', '/api/me/transfer', { from: 'warChest', to: 'wallet', amount: 1 })).body.error).toBe('insufficient_funds');
    expect((await p.call('POST', '/api/me/transfer', { from: 'wallet', to: 'wallet', amount: 1 })).status).toBe(400);
    expect(await walletOf(ctx, p.characterId)).toEqual(start);
  });
});
