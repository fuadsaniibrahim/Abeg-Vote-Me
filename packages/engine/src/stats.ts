import { clamp } from './rng.js';

export const STAT_KEYS = ['charisma', 'wealth', 'connections', 'integrity', 'publicImage', 'intelligence', 'stamina', 'mediaSkill'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export type StatMods = Partial<Record<StatKey, number>>;

export const STAT_LABELS: Record<StatKey, string> = {
  charisma: 'Charisma',
  wealth: 'Wealth',
  connections: 'Connections',
  integrity: 'Integrity',
  publicImage: 'Public Image',
  intelligence: 'Intelligence',
  stamina: 'Stamina',
  mediaSkill: 'Media Skill',
};

export const STAT_MIN = 0;
export const STAT_MAX = 100;

export function clampStat(v: number): number {
  return Math.round(clamp(v, STAT_MIN, STAT_MAX));
}

export function isStatKey(k: string): k is StatKey {
  return (STAT_KEYS as readonly string[]).includes(k);
}

/** Uniform stats at `value` (clamped). */
export function baseStats(value = 50): Stats {
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = clampStat(value);
  return s;
}

/** Apply one or more modifier sets; result is clamped to 0-100 and rounded. Input is not mutated. */
export function applyStatMods(stats: Stats, ...mods: StatMods[]): Stats {
  const out = { ...stats };
  for (const m of mods) for (const k of STAT_KEYS) if (m[k] !== undefined) out[k] = out[k] + (m[k] as number);
  for (const k of STAT_KEYS) out[k] = clampStat(out[k]);
  return out;
}
