// Socket.IO: session-cookie auth, per-character rooms for notifications, chat channel rooms.
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import type { AppContext } from './context.js';
import { SESSION_COOKIE } from './auth/routes.js';
import { sha256 } from './auth/crypto.js';
import { GameError, type CharacterRow } from './game/core.js';
import { assertChannelAccess, blockersOf, history, sendMessage } from './game/chat.js';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function characterForToken(ctx: AppContext, token: string): Promise<CharacterRow | null> {
  const r = await ctx.db.query<CharacterRow>(
    `SELECT c.* FROM sessions s JOIN users u ON u.id = s.user_id JOIN characters c ON c.user_id = u.id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.banned_at IS NULL AND u.email_verified_at IS NOT NULL`,
    [sha256(token)],
  );
  return r.rows[0] ?? null;
}

type Ack = (res: { ok: true; [k: string]: unknown } | { ok: false; error: string; message: string }) => void;

function fail(ack: Ack | undefined, e: unknown) {
  if (e instanceof GameError) ack?.({ ok: false, error: e.code, message: e.message });
  else ack?.({ ok: false, error: 'server_error', message: 'Something went wrong.' });
}

export function attachRealtime(app: FastifyInstance, ctx: AppContext): Server {
  const io = new Server(app.server, { path: '/socket.io', serveClient: false, cors: { origin: false } });

  io.use(async (socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
      const c = token ? await characterForToken(ctx, token) : null;
      if (!c) return next(new Error('unauthorized'));
      socket.data.characterId = c.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  ctx.realtime = {
    toCharacter: (characterId, event, payload) => {
      io.to(`char:${characterId}`).emit(event, payload);
    },
  };

  async function me(socket: Socket): Promise<CharacterRow> {
    const r = await ctx.db.query<CharacterRow>('SELECT * FROM characters WHERE id = $1', [socket.data.characterId]);
    if (!r.rows[0]) throw new GameError(401, 'unauthenticated', 'Character not found.');
    return r.rows[0];
  }

  io.on('connection', (socket) => {
    void socket.join(`char:${socket.data.characterId as string}`);

    socket.on('chat:join', async (channel: unknown, ack?: Ack) => {
      try {
        if (typeof channel !== 'string') throw new GameError(400, 'bad_channel', 'Unknown channel.');
        const c = await me(socket);
        await assertChannelAccess(ctx.db, c, channel);
        await socket.join(`chan:${channel}`);
        ack?.({ ok: true, messages: await history(ctx, c, channel) });
      } catch (e) {
        fail(ack, e);
      }
    });

    socket.on('chat:leave', async (channel: unknown) => {
      if (typeof channel === 'string') await socket.leave(`chan:${channel}`);
    });

    socket.on('chat:send', async (msg: unknown, ack?: Ack) => {
      try {
        const m = msg as { channel?: unknown; body?: unknown };
        if (typeof m?.channel !== 'string' || typeof m?.body !== 'string') throw new GameError(400, 'invalid_input', 'Bad message.');
        const c = await me(socket);
        const saved = await sendMessage(ctx, c, m.channel, m.body);
        // deliver to everyone in the channel except people who blocked the sender
        const blockers = await blockersOf(ctx.db, c.id);
        const sockets = await io.in(`chan:${m.channel}`).fetchSockets();
        for (const s of sockets) if (!blockers.has(s.data.characterId as string)) s.emit('chat:message', saved);
        // DMs also reach the other person even if they have not opened the conversation
        if (m.channel.startsWith('dm:')) {
          const other = m.channel.split(':').slice(1).find((id) => id !== c.id) as string;
          if (!blockers.has(other)) io.to(`char:${other}`).except(`chan:${m.channel}`).emit('chat:message', saved);
        }
        ack?.({ ok: true, message: saved });
      } catch (e) {
        fail(ack, e);
      }
    });
  });

  return io;
}
