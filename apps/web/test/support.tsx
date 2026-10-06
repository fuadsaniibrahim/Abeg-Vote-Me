// Test support: run the real server in-process and give the web app a browser-like cookie jar.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { io } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { buildApp } from '../../server/src/app';
import type { AppContext } from '../../server/src/context';
import { attachRealtime } from '../../server/src/realtime';
import { createTestContext } from '../../server/test/helpers';
import { setApiBase, authApi, gameApi } from '../src/api/client';
import { setSocketFactory, disconnectSocket } from '../src/realtime';
import { AppRoutes } from '../src/App';
import { useAuth } from '../src/store/auth';
import { useGame } from '../src/store/game';

export interface TestServer {
  ctx: AppContext;
  url: string;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const ctx = await createTestContext({ seed: true });
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 10_000 } };
  const app: FastifyInstance = await buildApp(ctx);
  const ioServer: Server = attachRealtime(app, ctx);
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  setApiBase(url);
  return {
    ctx,
    url,
    close: async () => {
      disconnectSocket();
      await ioServer.close();
      await app.close();
      await ctx.db.close();
    },
  };
}

const realFetch = globalThis.fetch;
const jar = new Map<string, string>();

/** Wrap fetch so cookies set by the server are sent back, like a browser. */
export function useCookieJar() {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    // an explicitly passed cookie (acting as another player) wins over the jar
    if (jar.size && !headers.has('cookie')) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await realFetch(input, { ...init, headers });
    for (const c of res.headers.getSetCookie()) {
      const [kv = ''] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /expires=thu, 01 jan 1970/i.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
    return res;
  }) as typeof fetch;
}

export function clearCookies() {
  jar.clear();
}

export function cookieHeader(): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Register with a username (no email), sign in the auth store, point sockets at the server with this cookie. */
export async function signUp(srv: TestServer, username: string): Promise<void> {
  clearCookies();
  const { user } = await authApi.register({ username, password: 'web-test-pass-1', acceptTerms: true });
  useAuth.setState({ user, status: 'ready' });
  useGame.setState({ profile: null, status: 'idle', notifications: [], clock: null });
  const cookie = cookieHeader();
  setSocketFactory(() => io(srv.url, { path: '/socket.io', transports: ['websocket'], extraHeaders: { cookie }, forceNew: true }));
}

export async function createCharacterViaApi(name: string, over: Partial<Parameters<typeof gameApi.createCharacter>[0]> = {}) {
  return gameApi.createCharacter({ name, gender: 'male', age: 40, homeStateCode: 'OY', homeLgaId: 'OY-006', background: 'trader', traits: ['workhorse', 'grassroots_hero'], ...over });
}

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}
