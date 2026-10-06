import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Postgres connection string. If absent, an embedded PGlite database is used. */
  DATABASE_URL: z.string().url().optional(),
  /** PGlite data directory when DATABASE_URL is absent. "memory" keeps it in RAM. */
  PGLITE_DIR: z.string().default(resolve(repoRoot, '.pglite')),
  REDIS_URL: z.string().url().optional(),
  /** Public URL of the web app, used in emailed links. */
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  WORLD_SEED: z.string().min(1).default('abeg-vote-me-season-1'),
  COOKIE_SECRET: z.string().min(16).default('dev-only-cookie-secret-change-me'),
  GAME_CONFIG_PATH: z.string().default(resolve(repoRoot, 'config/game.json')),
});
export type Env = z.infer<typeof envSchema>;

const phaseHours = z.object({
  registration: z.number().positive(),
  primaries: z.number().positive(),
  screening: z.number().positive(),
  campaign: z.number().positive(),
  debates: z.number().positive(),
  voting: z.number().min(24).max(48),
  collation: z.number().positive(),
  tribunal: z.number().positive(),
  swearing_in: z.number().positive(),
});

export const gameConfigSchema = z.object({
  calendar: z.object({
    realMsPerGameMonth: z.number().int().positive(),
    startGameYear: z.number().int(),
    startGameMonth: z.number().int().min(1).max(12),
  }),
  terms: z.object({
    years: z.number().int().positive(),
    maxTerms: z.record(z.string(), z.number().int().positive()),
  }),
  election: z.object({ phaseHours }),
  inactivity: z
    .object({ autopilotAfterDays: z.number().positive(), vacancyAfterDays: z.number().positive() })
    .refine((v) => v.vacancyAfterDays > v.autopilotAfterDays, 'vacancyAfterDays must exceed autopilotAfterDays'),
  rookieShieldDays: z.number().min(0),
  auth: z.object({
    sessionDays: z.number().positive(),
    verificationTokenHours: z.number().positive(),
    minPasswordLength: z.number().int().min(8),
  }),
  rateLimits: z.object({ authPerMinute: z.number().int().positive(), globalPerMinute: z.number().int().positive() }),
});
export type GameConfig = z.infer<typeof gameConfigSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  if (parsed.data.NODE_ENV === 'production' && parsed.data.COOKIE_SECRET.startsWith('dev-only')) {
    throw new Error('COOKIE_SECRET must be set in production');
  }
  return parsed.data;
}

export function parseGameConfig(raw: unknown): GameConfig {
  const parsed = gameConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid game config:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function loadGameConfig(path: string): GameConfig {
  return parseGameConfig(JSON.parse(readFileSync(path, 'utf8')));
}
