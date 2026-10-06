import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { createTestContext } from './helpers.js';

let ctx: AppContext;
let app: FastifyInstance;
beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
  app = await buildApp(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.db.close();
});

describe('health', () => {
  it('reports ok with the database driver in use', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'pglite', dbOk: true, kv: 'memory' });
  });
});

describe('world summary', () => {
  it('reports the seeded world with every seat held by an NPC', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/world/summary' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.seeded).toBe(true);
    expect(body.counts.seats).toBe(1317);
    expect(body.seatsHeldByNpcs).toBe(1317);
    expect(body.seatsHeldByPlayers).toBe(0);
  });
});
