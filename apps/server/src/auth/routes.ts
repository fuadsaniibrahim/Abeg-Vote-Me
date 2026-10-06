import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { audit } from '../audit.js';
import { sendMail } from '../mailer.js';
import { hashPassword, newToken, normaliseEmail, sha256, verifyPassword } from './crypto.js';

export const SESSION_COOKIE = 'avm_sid';

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: 'player' | 'admin';
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  role: 'player' | 'admin';
  banned_at: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: PublicUser | null;
    sessionId: string | null;
  }
}

const toPublic = (u: UserRow): PublicUser => ({ id: u.id, email: u.email, emailVerified: !!u.email_verified_at, role: u.role });

export function sendError(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}

/** Resolves the session cookie into request.user on every request. */
export function registerSessionHook(app: FastifyInstance, ctx: AppContext) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const r = await ctx.db.query<UserRow & { session_id: string }>(
      `SELECT u.*, s.id AS session_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.banned_at IS NULL`,
      [sha256(token)],
    );
    const row = r.rows[0];
    if (row) {
      req.user = toPublic(row);
      req.sessionId = row.session_id;
    }
  });
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): PublicUser | null {
  if (!req.user) {
    void sendError(reply, 401, 'unauthenticated', 'Abeg, log in first.');
    return null;
  }
  return req.user;
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, game, env } = ctx;
  const rateLimit = { rateLimit: { max: game.rateLimits.authPerMinute, timeWindow: '1 minute' } };

  const credentials = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(game.auth.minPasswordLength).max(200),
  });

  async function startSession(req: FastifyRequest, reply: FastifyReply, userId: string) {
    const token = newToken();
    const expires = new Date(Date.now() + game.auth.sessionDays * 86400_000);
    await db.query('INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)', [
      userId,
      sha256(token),
      req.ip,
      req.headers['user-agent'] ?? null,
      expires.toISOString(),
    ]);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      expires,
    });
  }

  async function issueVerification(tx: Parameters<typeof sendMail>[0], userId: string, email: string) {
    const token = newToken();
    const expires = new Date(Date.now() + game.auth.verificationTokenHours * 3600_000);
    await tx.query('INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, sha256(token), expires.toISOString()]);
    const link = `${env.WEB_ORIGIN}/verify?token=${token}`;
    await sendMail(
      tx,
      {
        to: email,
        subject: 'Abeg Vote Me: confirm your email',
        body: `Welcome to Abeg Vote Me!\n\nConfirm your email to start your political career:\n${link}\n\nThis link expires in ${game.auth.verificationTokenHours} hours.`,
      },
      env.NODE_ENV === 'development' ? (m) => app.log.info(m) : undefined,
    );
  }

  app.post('/api/auth/register', { config: rateLimit }, async (req, reply) => {
    const parsed = credentials
      .extend({ acceptTerms: z.literal(true, { message: 'You must accept the terms' }) })
      .safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'invalid_input', parsed.error.issues[0]?.message ?? 'Invalid input');
    const { email, password } = parsed.data;
    const normalised = normaliseEmail(email);
    const passwordHash = await hashPassword(password);
    try {
      const user = await db.transaction(async (tx) => {
        const r = await tx.query<UserRow>('INSERT INTO users (email, email_normalized, password_hash) VALUES ($1, $2, $3) RETURNING *', [
          email.trim(),
          normalised,
          passwordHash,
        ]);
        const u = r.rows[0] as UserRow;
        await issueVerification(tx, u.id, u.email);
        await audit(tx, { action: 'auth.register', actorUserId: u.id, targetType: 'user', targetId: u.id, ip: req.ip });
        return u;
      });
      await startSession(req, reply, user.id);
      return reply.code(201).send({ user: toPublic(user) });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return sendError(reply, 409, 'email_taken', 'An account with this email already exists.');
      throw e;
    }
  });

  app.post('/api/auth/verify-email', { config: rateLimit }, async (req, reply) => {
    const parsed = z.object({ token: z.string().min(10).max(200) }).safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'invalid_input', 'Missing token');
    const result = await db.transaction(async (tx) => {
      // Consume atomically: only an unused, unexpired token matches.
      const r = await tx.query<{ user_id: string }>(
        `UPDATE email_verification_tokens SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING user_id`,
        [sha256(parsed.data.token)],
      );
      const userId = r.rows[0]?.user_id;
      if (!userId) return null;
      const u = await tx.query<UserRow>('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING *', [userId]);
      await audit(tx, { action: 'auth.verify_email', actorUserId: userId, targetType: 'user', targetId: userId, ip: req.ip });
      return u.rows[0] as UserRow;
    });
    if (!result) return sendError(reply, 400, 'invalid_token', 'This link is invalid, used or expired.');
    return { user: toPublic(result) };
  });

  app.post('/api/auth/resend-verification', { config: rateLimit }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (user.emailVerified) return sendError(reply, 400, 'already_verified', 'Your email is already verified.');
    await db.transaction((tx) => issueVerification(tx, user.id, user.email));
    return { ok: true };
  });

  app.post('/api/auth/login', { config: rateLimit }, async (req, reply) => {
    const parsed = z.object({ email: z.string().trim().max(254), password: z.string().max(200) }).safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'invalid_input', 'Email and password required');
    const r = await db.query<UserRow>('SELECT * FROM users WHERE email_normalized = $1', [normaliseEmail(parsed.data.email)]);
    const u = r.rows[0];
    const ok = u ? await verifyPassword(parsed.data.password, u.password_hash) : false;
    if (!u || !ok) {
      await audit(db, { action: 'auth.login_failed', actorUserId: u?.id ?? null, details: { email: normaliseEmail(parsed.data.email) }, ip: req.ip });
      return sendError(reply, 401, 'bad_credentials', 'Email or password no correct.');
    }
    if (u.banned_at) return sendError(reply, 403, 'banned', 'This account has been banned.');
    await startSession(req, reply, u.id);
    await audit(db, { action: 'auth.login', actorUserId: u.id, targetType: 'user', targetId: u.id, ip: req.ip });
    return { user: toPublic(u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) {
      await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [req.sessionId]);
      await audit(db, { action: 'auth.logout', actorUserId: req.user?.id ?? null, targetType: 'session', targetId: req.sessionId, ip: req.ip });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return { user };
  });

  // Development helper: read the outbox so the verify flow can be completed without SMTP.
  if (env.NODE_ENV !== 'production') {
    app.get('/api/dev/outbox', async () => {
      const r = await db.query('SELECT id, to_email, subject, body, created_at FROM outbox_emails ORDER BY id DESC LIMIT 20');
      return { emails: r.rows };
    });
  }
}
