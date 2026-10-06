import { describe, expect, it } from 'vitest';
import { BUSINESS_SECTORS } from '@avm/data';
import { Rng } from '../src/rng.js';
import { baseStats } from '../src/stats.js';
import {
  businessStartCost,
  currentEnergy,
  economyFactor,
  energyRegenPerHour,
  getSector,
  monthlyBusinessIncome,
  protestOutcome,
  rallyOutcome,
} from '../src/citizen.js';

describe('energy', () => {
  it('regenerates 5-15 per hour depending on stamina, capped at 100', () => {
    expect(energyRegenPerHour(0)).toBe(5);
    expect(energyRegenPerHour(100)).toBe(15);
    expect(currentEnergy(20, 0, 2 * 3_600_000, 50)).toBe(40);
    expect(currentEnergy(90, 0, 10 * 3_600_000, 100)).toBe(100);
    expect(currentEnergy(30, 1000, 500, 50)).toBe(30); // clock skew never drains energy
  });
});

describe('rally outcome', () => {
  it('only ever improves or slightly costs stats, never money', () => {
    for (let i = 0; i < 500; i++) {
      const o = rallyOutcome(baseStats(50), new Rng(i));
      expect(o.cost).toBe(0);
      expect(['rain', 'good', 'great']).toContain(o.tag);
    }
  });

  it('charismatic candidates get great rallies more often', () => {
    const great = (charisma: number) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (rallyOutcome({ ...baseStats(50), charisma }, new Rng(i)).tag === 'great') n++;
      return n / 2000;
    };
    expect(great(95)).toBeGreaterThan(great(5) + 0.2);
  });
});

describe('protest outcome', () => {
  const rate = (insecurity: number, tag: string) => {
    let n = 0;
    for (let i = 0; i < 4000; i++) if (protestOutcome(baseStats(50), insecurity, new Rng(i)).tag === tag) n++;
    return n / 4000;
  };

  it('detention is more likely where insecurity is high, and costs a fine', () => {
    expect(rate(90, 'detained')).toBeGreaterThan(rate(10, 'detained') + 0.1);
    const detained = Array.from({ length: 500 }, (_, i) => protestOutcome(baseStats(50), 90, new Rng(i))).find((o) => o.tag === 'detained');
    expect(detained?.cost).toBeGreaterThan(0);
  });

  it('every outcome raises public image (the reward for showing up)', () => {
    for (let i = 0; i < 300; i++) expect(protestOutcome(baseStats(50), 50, new Rng(i)).mods.publicImage).toBeGreaterThan(0);
  });
});

describe('business', () => {
  const pos = getSector('pos')!;

  it('has sectors with positive capital and yield', () => {
    expect(BUSINESS_SECTORS.length).toBeGreaterThanOrEqual(6);
    for (const s of BUSINESS_SECTORS) {
      expect(s.minCapital).toBeGreaterThan(0);
      expect(s.monthlyYield).toBeGreaterThan(0);
    }
  });

  it('businessperson perk gives 20% off start cost', () => {
    expect(businessStartCost(1_000_000, [])).toBe(1_000_000);
    expect(businessStartCost(1_000_000, ['business_discount'])).toBe(800_000);
  });

  it('income is never negative and averages near capital × yield in a normal economy', () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const inc = monthlyBusinessIncome(pos, 1_000_000, 1, 50, new Rng(i));
      expect(inc).toBeGreaterThanOrEqual(0);
      sum += inc;
    }
    const avg = sum / 2000;
    expect(avg).toBeGreaterThan(1_000_000 * pos.monthlyYield * 0.85);
    expect(avg).toBeLessThan(1_000_000 * pos.monthlyYield * 1.15);
  });

  it('a bad economy (high inflation, high insecurity) lowers the economy factor', () => {
    expect(economyFactor(15, 30)).toBeCloseTo(1);
    expect(economyFactor(40, 70)).toBeLessThan(0.6);
    expect(economyFactor(200, 100)).toBe(0.4);
  });
});
