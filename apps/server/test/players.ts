import type { FastifyInstance, InjectOptions } from 'fastify';
import type { AppContext } from '../src/context.js';
import { SESSION_COOKIE } from '../src/auth/routes.js';
import { cookieFrom } from './helpers.js';

export interface TestPlayer {
  cookie: string;
  token: string;
  characterId: string;
  userId: string;
  name: string;
  /** app.inject with this player's cookie. */
  call: (method: InjectOptions['method'], url: string, payload?: unknown) => Promise<{ status: number; body: any }>;
}

let n = 0;

/** Register, mark email verified (the verify flow itself is tested in auth.test.ts), create a character. */
export async function makePlayer(
  app: FastifyInstance,
  ctx: AppContext,
  over: Partial<{ name: string; homeStateCode: string; homeLgaId: string; background: string; traits: string[]; age: number; gender: 'male' | 'female' }> = {},
): Promise<TestPlayer> {
  n++;
  const email = `player${n}-${Date.now()}@test.ng`;
  const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'test-password-1', acceptTerms: true } });
  const cookie = cookieFrom(reg.headers['set-cookie'], SESSION_COOKIE) as string;
  const userId = reg.json().user.id as string;
  await ctx.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
  const call = async (method: InjectOptions['method'], url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, payload: payload as InjectOptions['payload'], headers: { cookie } });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };
  const names = ['Ada Obi-Eze', 'Musa Danladi', 'Funke Adeyemi', 'Tari Briggs', 'Terver Agbo', 'Hauwa Gambo', 'Emeka Okafor', 'Kemi Ajayi'];
  const name = over.name ?? `${names[n % names.length]} ${String.fromCharCode(65 + (n % 26))}`;
  const create = await call('POST', '/api/characters', {
    name: name.replace(/ [A-Z]$/, '') + ` ${['Bello', 'Okon', 'Ibe', 'Yisa', 'Pam'][n % 5]}`,
    gender: over.gender ?? 'female',
    age: over.age ?? 35,
    homeStateCode: over.homeStateCode ?? 'LA',
    homeLgaId: over.homeLgaId ?? 'LA-011',
    background: over.background ?? 'lawyer',
    traits: over.traits ?? ['workhorse', 'street_smart'],
  });
  if (create.status !== 201) throw new Error(`makePlayer failed: ${JSON.stringify(create.body)}`);
  return { cookie, token: cookie.split('=')[1] as string, characterId: create.body.character.id, userId, name: create.body.character.name, call };
}

export async function walletOf(ctx: AppContext, id: string): Promise<{ wallet: number; warChest: number }> {
  const r = await ctx.db.query<{ wallet: number; war_chest: number }>('SELECT wallet, war_chest FROM characters WHERE id = $1', [id]);
  return { wallet: Number(r.rows[0]?.wallet), warChest: Number(r.rows[0]?.war_chest) };
}
