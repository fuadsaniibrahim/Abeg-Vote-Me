import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';
import { NEUTRAL_POLICY, averageInsecurity, insecurityEffects, tickInsecurity, type InsecurityLevels, type SecurityPolicy } from '../src/insecurity.js';

const start: InsecurityLevels = { banditry: 60, kidnapping: 50, farmer_herder: 40, communal: 30, militancy: 20, urban_crime: 35 };

function run(policy: SecurityPolicy, months = 24, poverty = 60, seed = 's') {
  const rng = new Rng(seed);
  let l = start;
  for (let i = 0; i < months; i++) l = tickInsecurity(l, policy, poverty, rng);
  return l;
}

const strong: SecurityPolicy = { ...NEUTRAL_POLICY, securityBudget: 1, troopDeployment: 1, intelligence: 1, communityPolicing: 1, youthPrograms: 1, amnesty: 0.6, borderControl: 1 };
const weak: SecurityPolicy = { ...NEUTRAL_POLICY, securityBudget: 0.1, troopDeployment: 0.1, intelligence: 0.1, communityPolicing: 0.1, youthPrograms: 0.1, borderControl: 0.1 };

describe('insecurity tick', () => {
  it('is deterministic for the same seed', () => {
    expect(run(NEUTRAL_POLICY, 12, 60, 'x')).toEqual(run(NEUTRAL_POLICY, 12, 60, 'x'));
  });

  it('strong policy lowers insecurity; weak policy raises it', () => {
    expect(averageInsecurity(run(strong))).toBeLessThan(averageInsecurity(start) - 10);
    expect(averageInsecurity(run(weak))).toBeGreaterThan(averageInsecurity(start) + 5);
  });

  it('diverting the security vote cancels much of the budget effect', () => {
    const honest = averageInsecurity(run(strong));
    const looted = averageInsecurity(run({ ...strong, diversion: 0.9 }));
    expect(looted).toBeGreaterThan(honest + 5);
  });

  it('amnesty and youth programmes reduce militancy most', () => {
    const before = run(NEUTRAL_POLICY);
    const after = run({ ...NEUTRAL_POLICY, amnesty: 1, youthPrograms: 1 });
    expect(before.militancy - after.militancy).toBeGreaterThan(before.banditry - after.banditry);
  });

  it('funding vigilantes helps banditry but raises communal tension', () => {
    const base = run(NEUTRAL_POLICY);
    const vig = run({ ...NEUTRAL_POLICY, vigilanteSupport: 1 });
    expect(vig.banditry).toBeLessThan(base.banditry);
    expect(vig.communal).toBeGreaterThan(base.communal);
  });

  it('higher poverty pushes insecurity up', () => {
    expect(averageInsecurity(run(NEUTRAL_POLICY, 24, 90))).toBeGreaterThan(averageInsecurity(run(NEUTRAL_POLICY, 24, 20)));
  });

  it('levels stay within 0-100 even under extreme inputs for 10 years', () => {
    for (const p of [strong, weak]) {
      const rng = new Rng('bounds');
      let l = start;
      for (let i = 0; i < 120; i++) {
        l = tickInsecurity(l, p, p === weak ? 100 : 0, rng);
        for (const v of Object.values(l)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe('insecurity effects', () => {
  const calm: InsecurityLevels = { banditry: 5, kidnapping: 5, farmer_herder: 5, communal: 5, militancy: 5, urban_crime: 5 };
  const bad: InsecurityLevels = { banditry: 90, kidnapping: 85, farmer_herder: 80, communal: 60, militancy: 30, urban_crime: 50 };

  it('worse insecurity lowers farm output, schooling, investment and turnout', () => {
    const c = insecurityEffects(calm);
    const b = insecurityEffects(bad);
    expect(b.farmOutput).toBeLessThan(c.farmOutput);
    expect(b.foodPricePressure).toBeGreaterThan(c.foodPricePressure);
    expect(b.schoolAttendance).toBeLessThan(c.schoolAttendance);
    expect(b.investment).toBeLessThan(c.investment);
    expect(b.turnoutPenalty).toBeGreaterThan(c.turnoutPenalty);
  });

  it('rallies are unsafe when any insecurity type is 70 or above', () => {
    expect(insecurityEffects(calm).rallySafe).toBe(true);
    expect(insecurityEffects(bad).rallySafe).toBe(false);
    expect(insecurityEffects({ ...calm, urban_crime: 70 }).rallySafe).toBe(false);
  });
});
