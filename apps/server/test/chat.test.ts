import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as connect, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { attachRealtime } from '../src/realtime.js';
import { dmChannel } from '../src/game/chat.js';
import { createTestContext } from './helpers.js';
import { makePlayer, type TestPlayer } from './players.js';

let ctx: AppContext;
let app: FastifyInstance;
let io: Server;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  ctx = await createTestContext({ seed: true });
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 10_000 } };
  app = await buildApp(ctx);
  io = attachRealtime(app, ctx);
  url = await app.listen({ port: 0, host: '127.0.0.1' });
});
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await io.close();
  await app.close();
  await ctx.db.close();
});

function socketFor(p: TestPlayer | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { path: '/socket.io', transports: ['websocket'], extraHeaders: p ? { cookie: p.cookie } : {}, reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}

type AckRes = { ok: boolean; error?: string; message?: unknown; messages?: { body: string; senderId: string }[] };
const emit = (s: Socket, ev: string, payload: unknown) => new Promise<AckRes>((r) => s.emit(ev, payload, r));
/** Collect events of a type for `ms` milliseconds. */
function collect<T>(s: Socket, ev: string, ms = 300): Promise<T[]> {
  const got: T[] = [];
  const h = (x: T) => got.push(x);
  s.on(ev, h);
  return new Promise((r) => setTimeout(() => (s.off(ev, h), r(got)), ms));
}

describe('socket auth', () => {
  it('rejects connections without a valid session', async () => {
    await expect(socketFor(null)).rejects.toThrow(/unauthorized/);
  });
});

describe('channels', () => {
  let a: TestPlayer, b: TestPlayer, kano: TestPlayer;
  let sa: Socket, sb: Socket, sk: Socket;
  beforeAll(async () => {
    a = await makePlayer(app, ctx);
    b = await makePlayer(app, ctx);
    kano = await makePlayer(app, ctx, { homeStateCode: 'KN', homeLgaId: 'KN-001' });
    [sa, sb, sk] = await Promise.all([socketFor(a), socketFor(b), socketFor(kano)]);
  });

  it('global chat: message is stored and delivered live to others in the channel', async () => {
    expect((await emit(sa, 'chat:join', 'global')).ok).toBe(true);
    expect((await emit(sb, 'chat:join', 'global')).ok).toBe(true);
    const inbox = collect<{ body: string; senderName: string }>(sb, 'chat:message');
    const ack = await emit(sa, 'chat:send', { channel: 'global', body: 'Good morning Naija!' });
    expect(ack.ok).toBe(true);
    expect((await inbox).map((m) => m.body)).toEqual(['Good morning Naija!']);
    const hist = (await b.call('GET', '/api/chat/messages?channel=global')).body.messages;
    expect(hist.at(-1)).toMatchObject({ body: 'Good morning Naija!', senderId: a.characterId });
  });

  it('state chat is limited to your home state', async () => {
    expect((await emit(sa, 'chat:join', 'state:LA')).ok).toBe(true);
    const denied = await emit(sk, 'chat:join', 'state:LA');
    expect(denied).toMatchObject({ ok: false, error: 'forbidden' });
    expect((await emit(sk, 'chat:send', { channel: 'state:LA', body: 'hi' })).ok).toBe(false);
  });

  it('party chat is for members only', async () => {
    await a.call('POST', '/api/parties/PUP/join');
    const pup = (await ctx.db.query<{ id: string }>("SELECT id FROM parties WHERE code = 'PUP'")).rows[0]!.id;
    expect((await emit(sa, 'chat:join', `party:${pup}`)).ok).toBe(true);
    expect((await emit(sb, 'chat:join', `party:${pup}`)).ok).toBe(false);
  });

  it('filters profanity and rejects incitement', async () => {
    const masked = await emit(sa, 'chat:send', { channel: 'global', body: 'this na shit policy' });
    expect(masked.ok).toBe(true);
    expect((masked.message as { body: string }).body).toBe('this na s*** policy');
    const rejected = await emit(sa, 'chat:send', { channel: 'global', body: 'we go kill all of them' });
    expect(rejected).toMatchObject({ ok: false, error: 'rejected_message' });
  });

  it('rate limits fast senders', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) results.push((await emit(sk, 'chat:send', { channel: 'global', body: `spam ${i}` })).ok);
    expect(results.filter((x) => x).length).toBeLessThanOrEqual(ctx.game.chat.messagesPer10s);
    expect(results.at(-1)).toBe(false);
  });

  it('muted users cannot send', async () => {
    await ctx.db.query("UPDATE users SET muted_until = now() + interval '1 hour' WHERE id = $1", [b.userId]);
    expect(await emit(sb, 'chat:send', { channel: 'global', body: 'hello?' })).toMatchObject({ ok: false, message: 'You are muted.' });
    await ctx.db.query('UPDATE users SET muted_until = NULL WHERE id = $1', [b.userId]);
  });
});

describe('private, group, block, report', () => {
  let x: TestPlayer, y: TestPlayer, z: TestPlayer;
  let sx: Socket, sy: Socket, sz: Socket;
  beforeAll(async () => {
    x = await makePlayer(app, ctx);
    y = await makePlayer(app, ctx);
    z = await makePlayer(app, ctx);
    [sx, sy, sz] = await Promise.all([socketFor(x), socketFor(y), socketFor(z)]);
  });

  it('DMs reach the other person even before they open the conversation; outsiders cannot join', async () => {
    const ch = (await x.call('POST', '/api/chat/dm', { characterId: y.characterId })).body.channel;
    expect(ch).toBe(dmChannel(x.characterId, y.characterId));
    const inbox = collect<{ body: string }>(sy, 'chat:message');
    expect((await emit(sx, 'chat:send', { channel: ch, body: 'Oga, how far?' })).ok).toBe(true);
    expect((await inbox).map((m) => m.body)).toEqual(['Oga, how far?']);
    expect((await emit(sz, 'chat:join', ch)).ok).toBe(false);
    const chans = (await y.call('GET', '/api/chat/channels')).body.channels.map((c: { id: string }) => c.id);
    expect(chans).toContain(ch);
  });

  it('group chat for members', async () => {
    const g = await x.call('POST', '/api/chat/groups', { name: 'Ikeja Strategy', memberIds: [y.characterId] });
    expect(g.status).toBe(201);
    expect((await emit(sy, 'chat:join', g.body.channel)).ok).toBe(true);
    expect((await emit(sz, 'chat:join', g.body.channel)).ok).toBe(false);
  });

  it('blocking hides the blocked person from your live feed and history, and stops their DMs', async () => {
    await emit(sx, 'chat:join', 'global');
    await emit(sz, 'chat:join', 'global');
    expect((await z.call('POST', '/api/chat/blocks', { characterId: x.characterId })).status).toBe(200);
    const zInbox = collect<{ senderId: string }>(sz, 'chat:message');
    const yInbox = collect<{ senderId: string }>(sy, 'chat:message');
    await emit(sy, 'chat:join', 'global');
    await emit(sx, 'chat:send', { channel: 'global', body: 'Can z see this?' });
    expect((await zInbox).filter((m) => m.senderId === x.characterId)).toEqual([]);
    expect((await yInbox).some((m) => m.senderId === x.characterId)).toBe(true);
    const hist = (await z.call('GET', '/api/chat/messages?channel=global')).body.messages;
    expect(hist.some((m: { senderId: string }) => m.senderId === x.characterId)).toBe(false);
    const dm = dmChannel(x.characterId, z.characterId);
    expect(await emit(sx, 'chat:send', { channel: dm, body: 'hello' })).toMatchObject({ ok: false, message: 'This person has blocked you.' });
  });

  it('report a message', async () => {
    const msg = await ctx.db.query<{ id: number }>('SELECT id FROM chat_messages WHERE sender_id = $1 LIMIT 1', [x.characterId]);
    const r = await y.call('POST', '/api/reports', { targetType: 'chat_message', targetId: String(msg.rows[0]!.id), reason: 'Spamming the channel' });
    expect(r.status).toBe(201);
    const row = await ctx.db.query("SELECT status FROM reports WHERE id = $1", [r.body.id]);
    expect(row.rows[0]).toEqual({ status: 'open' });
  });
});

describe('live notifications', () => {
  it('a donation notifies the recipient over the socket immediately', async () => {
    const giver = await makePlayer(app, ctx);
    const taker = await makePlayer(app, ctx);
    const s = await socketFor(taker);
    const got = collect<{ kind: string; title: string }>(s, 'notification');
    await giver.call('POST', '/api/donations', { recipientType: 'candidate', recipientId: taker.characterId, amount: 7000 });
    const notes = await got;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: 'donation' });
    expect(notes[0]!.title).toMatch(/₦7,000/);
  });
});
