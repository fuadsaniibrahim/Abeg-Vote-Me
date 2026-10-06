// Shared game helpers used by route modules: errors, character loading, money, stats, energy, cooldowns.
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Rng, applyStatMods, currentEnergy, type StatMods, type Stats } from '@avm/engine';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';

export class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export const bad = (code: string, message: string) => new GameError(400, code, message);
export const notFound = (message = 'Not found.') => new GameError(404, 'not_found', message);
export const forbidden = (message: string) => new GameError(403, 'forbidden', message);
export const conflict = (code: string, message: string) => new GameError(409, code, message);

/** Server-side randomness: a fresh seeded stream per action (seed is random, so it can't be predicted by clients). */
export function freshRng(): Rng {
  return new Rng(randomUUID());
}

export interface CharacterRow {
  id: string;
  user_id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  home_state_code: string;
  home_lga_id: string;
  background: string;
  traits: string[];
  stats: Stats;
  wallet: number;
  war_chest: number;
  energy: number;
  energy_updated_at: Date;
  journalist_rep: number;
  avatar_seed: string;
  created_at: Date;
}

/** Character for the signed-in user. Throws a GameError otherwise. */
export async function requireCharacter(ctx: AppContext, req: FastifyRequest, db: Queryable = ctx.db, lock = false): Promise<CharacterRow> {
  if (!req.user) throw new GameError(401, 'unauthenticated', 'Abeg, log in first.');
  const r = await db.query<CharacterRow>(`SELECT * FROM characters WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [req.user.id]);
  const c = r.rows[0];
  if (!c) throw new GameError(409, 'no_character', 'Create your character first.');
  return c;
}

export async function lockCharacter(db: Queryable, id: string): Promise<CharacterRow> {
  const r = await db.query<CharacterRow>('SELECT * FROM characters WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rows[0]) throw notFound('Character not found.');
  return r.rows[0];
}

export type Account = 'wallet' | 'warChest';
const COLUMN: Record<Account, string> = { wallet: 'wallet', warChest: 'war_chest' };

/** Atomically debit; fails (and changes nothing) if the balance is too low. Records a transaction row. */
export async function debit(db: Queryable, characterId: string, account: Account, amount: number, reason: string, ref?: { type: string; id: string }): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw bad('invalid_amount', 'Amount must be a positive whole number.');
  const col = COLUMN[account];
  const r = await db.query<{ bal: number }>(`UPDATE characters SET ${col} = ${col} - $2 WHERE id = $1 AND ${col} >= $2 RETURNING ${col} AS bal`, [characterId, amount]);
  if (!r.rows[0]) throw bad('insufficient_funds', account === 'wallet' ? 'Your wallet no reach.' : 'Your war chest no reach.');
  await db.query('INSERT INTO transactions (character_id, account, delta, reason, ref_type, ref_id) VALUES ($1, $2, $3, $4, $5, $6)', [characterId, account, -amount, reason, ref?.type ?? null, ref?.id ?? null]);
  return r.rows[0].bal;
}

export async function credit(db: Queryable, characterId: string, account: Account, amount: number, reason: string, ref?: { type: string; id: string }): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw bad('invalid_amount', 'Amount must be a positive whole number.');
  const col = COLUMN[account];
  const r = await db.query<{ bal: number }>(`UPDATE characters SET ${col} = ${col} + $2 WHERE id = $1 RETURNING ${col} AS bal`, [characterId, amount]);
  if (!r.rows[0]) throw notFound('Character not found.');
  await db.query('INSERT INTO transactions (character_id, account, delta, reason, ref_type, ref_id) VALUES ($1, $2, $3, $4, $5, $6)', [characterId, account, amount, reason, ref?.type ?? null, ref?.id ?? null]);
  return r.rows[0].bal;
}

/** Apply stat modifiers (engine clamps to 0-100). Caller should hold a row lock. */
export async function applyMods(db: Queryable, c: CharacterRow, mods: StatMods): Promise<Stats> {
  const stats = applyStatMods(c.stats, mods);
  await db.query('UPDATE characters SET stats = $2::jsonb WHERE id = $1', [c.id, JSON.stringify(stats)]);
  return stats;
}

export function energyNow(c: CharacterRow, nowMs = Date.now()): number {
  return currentEnergy(Number(c.energy), new Date(c.energy_updated_at).getTime(), nowMs, c.stats.stamina);
}

export async function spendEnergy(db: Queryable, c: CharacterRow, cost: number, nowMs = Date.now()): Promise<number> {
  const e = energyNow(c, nowMs);
  if (e < cost) throw bad('tired', `You are too tired. You need ${cost} energy; you have ${Math.floor(e)}.`);
  const left = e - cost;
  await db.query('UPDATE characters SET energy = $2, energy_updated_at = $3 WHERE id = $1', [c.id, left, new Date(nowMs).toISOString()]);
  return left;
}

/** Throws if `kind` was done less than `cooldownMs` ago; otherwise records it. */
export async function useCooldown(db: Queryable, characterId: string, kind: string, cooldownMs: number, nowMs = Date.now()): Promise<void> {
  const r = await db.query<{ at: Date }>('SELECT at FROM action_log WHERE character_id = $1 AND kind = $2 ORDER BY at DESC LIMIT 1', [characterId, kind]);
  const last = r.rows[0]?.at;
  if (last) {
    const wait = new Date(last).getTime() + cooldownMs - nowMs;
    if (wait > 0) throw new GameError(429, 'cooldown', `Wait ${formatWait(wait)} before you do that again.`);
  }
  await db.query('INSERT INTO action_log (character_id, kind, at) VALUES ($1, $2, $3)', [characterId, kind, new Date(nowMs).toISOString()]);
}

export function formatWait(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Map GameError (and Fastify validation errors) to JSON responses. */
export function errorHandler(err: Error & { statusCode?: number; validation?: unknown }, _req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof GameError) return reply.code(err.status).send({ error: err.code, message: err.message });
  if (err.statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Too many requests. Rest small.' });
  if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: 'bad_request', message: err.message });
  reply.log.error(err);
  return reply.code(500).send({ error: 'server_error', message: 'Something went wrong on our side.' });
}
