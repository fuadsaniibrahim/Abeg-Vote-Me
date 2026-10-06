import { describe, expect, it } from 'vitest';
import { computeLegacy, type LegacyInput } from '../src/legacy.js';
import { zoningModifier } from '../src/zoning.js';

const base: LegacyInput = {
  peakOffice: 'governor',
  monthsInOffice: 48,
  achievements: 8,
  metricsImprovement: 10,
  integrity: 70,
  exposedCorruption: 0,
  hiddenCorruption: 0,
  averageApproval: 55,
  electionsWon: 2,
  netWorth: 200_000_000,
};

describe('legacy score', () => {
  it('returns five components and a total, all 0-100', () => {
    const s = computeLegacy(base);
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(Object.keys(s).sort()).toEqual(['impact', 'integrity', 'popularity', 'power', 'total', 'wealth']);
  });

  it('corruption hurts integrity; exposed corruption hurts more than hidden', () => {
    const clean = computeLegacy(base).integrity;
    const exposed = computeLegacy({ ...base, exposedCorruption: 5_000_000_000 }).integrity;
    const hidden = computeLegacy({ ...base, hiddenCorruption: 5_000_000_000 }).integrity;
    expect(exposed).toBeLessThan(hidden);
    expect(hidden).toBeLessThan(clean);
  });

  it('higher office gives more power; more money gives more wealth', () => {
    expect(computeLegacy({ ...base, peakOffice: 'president' }).power).toBeGreaterThan(computeLegacy({ ...base, peakOffice: 'rep' }).power);
    expect(computeLegacy({ ...base, netWorth: 10_000_000_000 }).wealth).toBe(100);
    expect(computeLegacy({ ...base, netWorth: 0 }).wealth).toBe(0);
  });

  it('a citizen who never held office has zero power from office', () => {
    expect(computeLegacy({ ...base, peakOffice: 'citizen', monthsInOffice: 0 }).power).toBe(0);
  });
});

describe('zoning modifier', () => {
  it('is neutral when the ticket is open', () => {
    expect(zoningModifier('NW', { zonedTo: null, strength: 1 })).toBe(1);
  });

  it('boosts the zoned zone, penalises others, and allies less', () => {
    const z = { zonedTo: 'SE' as const, strength: 1, alliedZones: ['SS' as const] };
    expect(zoningModifier('SE', z)).toBeCloseTo(1.4);
    expect(zoningModifier('SS', z)).toBeCloseTo(0.7);
    expect(zoningModifier('NW', z)).toBeCloseTo(0.25);
  });

  it('scales with how seriously the party takes zoning', () => {
    expect(zoningModifier('NW', { zonedTo: 'SE', strength: 0.2 })).toBeGreaterThan(zoningModifier('NW', { zonedTo: 'SE', strength: 0.9 }));
  });
});
