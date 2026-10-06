import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadEnv, loadGameConfig, parseGameConfig } from '../src/config.js';

const gamePath = resolve(import.meta.dirname, '../../../config/game.json');

describe('game config', () => {
  it('loads and validates config/game.json', () => {
    const g = loadGameConfig(gamePath);
    expect(g.calendar.realMsPerGameMonth).toBe(86_400_000);
    expect(g.terms.maxTerms.GOVERNOR).toBe(2);
    expect(g.election.phaseHours.voting).toBeGreaterThanOrEqual(24);
  });

  it('rejects a voting window outside 24-48 hours', () => {
    const g = structuredClone(loadGameConfig(gamePath));
    g.election.phaseHours.voting = 12;
    expect(() => parseGameConfig(g)).toThrow(/Invalid game config/);
  });

  it('rejects vacancy timer shorter than autopilot timer', () => {
    const g = structuredClone(loadGameConfig(gamePath));
    g.inactivity = { autopilotAfterDays: 5, vacancyAfterDays: 2 };
    expect(() => parseGameConfig(g)).toThrow(/vacancyAfterDays/);
  });
});

describe('env', () => {
  it('applies defaults and uses PGlite when DATABASE_URL is absent', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'not a url' })).toThrow(/Invalid environment/);
  });

  it('refuses the dev cookie secret in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/COOKIE_SECRET/);
  });
});
