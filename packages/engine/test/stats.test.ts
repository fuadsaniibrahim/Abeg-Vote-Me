import { describe, expect, it } from 'vitest';
import { STAT_KEYS, applyStatMods, baseStats, clampStat } from '../src/stats.js';

describe('stats', () => {
  it('has the 8 stats from the spec', () => {
    expect([...STAT_KEYS]).toEqual(['charisma', 'wealth', 'connections', 'integrity', 'publicImage', 'intelligence', 'stamina', 'mediaSkill']);
  });

  it('clamps to 0-100 and rounds', () => {
    expect(clampStat(-5)).toBe(0);
    expect(clampStat(120)).toBe(100);
    expect(clampStat(49.6)).toBe(50);
  });

  it('applies several modifier sets, clamps, and does not mutate input', () => {
    const s = baseStats(95);
    const out = applyStatMods(s, { charisma: 10, integrity: -20 }, { charisma: 3, stamina: -100 });
    expect(out.charisma).toBe(100);
    expect(out.integrity).toBe(75);
    expect(out.stamina).toBe(0);
    expect(out.wealth).toBe(95);
    expect(s.charisma).toBe(95);
  });
});
