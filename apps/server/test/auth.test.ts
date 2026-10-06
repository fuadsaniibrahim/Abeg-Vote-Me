import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { SESSION_COOKIE } from '../src/auth/routes.js';
import { hashPassword, verifyPassword } from '../src/auth/crypto.js';
import { cookieFrom, createTestContext } from './helpers.js';

let ctx: AppContext;
let app: FastifyInstance;

beforeAll(async () => {
  ctx = await createTestContext({ game: undefined });
  // generous limit for the main suite; the rate-limit suite builds its own app
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 1000 } };
  app = await buildApp(ctx);
});
afterAll(async () => {
  await app.close();
  await ctx.db.close();
});

const register = (email: string, password = 'correct-horse-9', acceptTerms: boolean = true) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, acceptTerms } });

/** Pull the verification token from the newest outbox email to `email`. */
async function tokenFor(email: string): Promise<string> {
  const r = await ctx.db.query<{ body: string }>('SELECT body FROM outbox_emails WHERE to_email = $1 ORDER BY id DESC LIMIT 1', [email]);
  const m = /token=([A-Za-z0-9_-]+)/.exec(r.rows[0]?.body ?? '');
  if (!m?.[1]) throw new Error('no token email');
  return m[1];
}

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const h = await hashPassword('s3cret-pass');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('s3cret-pass', h)).toBe(true);
    expect(await verifyPassword('wrong-pass', h)).toBe(false);
    expect(await verifyPassword('s3cret-pass', 'garbage')).toBe(false);
  });
});

describe('register', () => {
  it('creates an unverified user, sets a session cookie and stores only a password hash', async () => {
    const res = await register('Ada@Example.ng');
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ email: 'Ada@Example.ng', emailVerified: false, role: 'player' });
    expect(cookieFrom(res.headers['set-cookie'], SESSION_COOKIE)).toBeDefined();
    const row = await ctx.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE email_normalized = 'ada@example.ng'");
    expect(row.rows[0]!.password_hash).not.toContain('correct-horse-9');
  });

  it('enforces one account per email, case-insensitively', async () => {
    const res = await register('  ADA@example.NG ');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('email_taken');
  });

  it('rejects short passwords, bad emails and missing terms acceptance', async () => {
    expect((await register('short@test.ng', 'abc')).statusCode).toBe(400);
    expect((await register('not-an-email')).statusCode).toBe(400);
    expect((await register('terms@test.ng', 'correct-horse-9', false)).statusCode).toBe(400);
  });

  it('sends a verification email through the outbox with a link', async () => {
    const r = await ctx.db.query<{ subject: string; body: string }>("SELECT subject, body FROM outbox_emails WHERE to_email = 'Ada@Example.ng'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.body).toMatch(/\/verify\?token=/);
  });

  it('stores the verification token hashed, not in plain text', async () => {
    const token = await tokenFor('Ada@Example.ng');
    const r = await ctx.db.query('SELECT 1 FROM email_verification_tokens WHERE token_hash = $1', [token]);
    expect(r.rows).toHaveLength(0);
  });
});

describe('verify-email', () => {
  it('verifies the email once; the token cannot be reused', async () => {
    await register('verify-me@test.ng');
    const token = await tokenFor('verify-me@test.ng');
    const ok = await app.inject({ method: 'POST', url: '/api/auth/verify-email', payload: { token } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.emailVerified).toBe(true);
    const again = await app.inject({ method: 'POST', url: '/api/auth/verify-email', payload: { token } });
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('invalid_token');
  });

  it('rejects an expired token', async () => {
    await register('expired@test.ng');
    const token = await tokenFor('expired@test.ng');
    await ctx.db.query(
      "UPDATE email_verification_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email_normalized = 'expired@test.ng')",
    );
    const res = await app.inject({ method: 'POST', url: '/api/auth/verify-email', payload: { token } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/verify-email', payload: { token: 'not-a-real-token-123' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('login, me, logout', () => {
  it('logs in with the right password and /me returns the user', async () => {
    await register('login@test.ng');
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'LOGIN@test.ng', password: 'correct-horse-9' } });
    expect(res.statusCode).toBe(200);
    const cookie = cookieFrom(res.headers['set-cookie'], SESSION_COOKIE)!;
    expect(res.headers['set-cookie']!.toString()).toMatch(/HttpOnly/i);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('login@test.ng');
  });

  it('rejects a wrong password and an unknown email with the same error', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'login@test.ng', password: 'wrong-password' } });
    const b = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nobody@test.ng', password: 'wrong-password' } });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().error).toBe(b.json().error);
  });

  it('/me without a session is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('logout revokes the session so the cookie stops working', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'login@test.ng', password: 'correct-horse-9' } });
    const cookie = cookieFrom(res.headers['set-cookie'], SESSION_COOKIE)!;
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('banned users cannot log in and existing sessions stop working', async () => {
    const reg = await register('banned@test.ng');
    const cookie = cookieFrom(reg.headers['set-cookie'], SESSION_COOKIE)!;
    await ctx.db.query("UPDATE users SET banned_at = now() WHERE email_normalized = 'banned@test.ng'");
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'banned@test.ng', password: 'correct-horse-9' } });
    expect(login.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('audit log for auth', () => {
  it('records register, verify, login, failed login and logout', async () => {
    const r = await ctx.db.query<{ action: string }>("SELECT DISTINCT action FROM audit_log WHERE action LIKE 'auth.%'");
    expect(r.rows.map((x) => x.action).sort()).toEqual(['auth.login', 'auth.login_failed', 'auth.logout', 'auth.register', 'auth.verify_email']);
  });
});

describe('rate limiting', () => {
  it('returns 429 after the configured number of auth requests per minute', async () => {
    const c = await createTestContext();
    c.game = { ...c.game, rateLimits: { ...c.game.rateLimits, authPerMinute: 3 } };
    const a = await buildApp(c);
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@test.ng', password: 'whatever-123' } });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes.slice(3)).toEqual([429, 429]);
    await a.close();
    await c.db.close();
  });
});
