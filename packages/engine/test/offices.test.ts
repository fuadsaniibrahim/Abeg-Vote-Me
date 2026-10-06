import { describe, expect, it } from 'vitest';
import {
  activityStatus,
  checkEligibility,
  deputySeatOf,
  npcGovernorSecurity,
  npcLocalDecision,
  npcPresidentEconomy,
  principalSeatOf,
  vacancyPlan,
  type OfficeCandidate,
  type OfficeRules,
} from '../src/offices.js';
import { Rng } from '../src/rng.js';
import { averageInsecurity, tickInsecurity, type InsecurityLevels } from '../src/insecurity.js';

const RULES: OfficeRules = {
  PRESIDENT: { minAge: 35, priorOffice: ['GOVERNOR', 'SENATOR'], requiresParty: true, residency: 'none' },
  VICE_PRESIDENT: { minAge: 35, priorOffice: [], requiresParty: true, residency: 'none' },
  GOVERNOR: { minAge: 35, priorOffice: [], requiresParty: true, residency: 'state' },
  DEPUTY_GOVERNOR: { minAge: 35, priorOffice: [], requiresParty: true, residency: 'state' },
  SENATOR: { minAge: 35, priorOffice: [], requiresParty: false, residency: 'state' },
  REP: { minAge: 25, priorOffice: [], requiresParty: false, residency: 'state' },
  LG_CHAIRMAN: { minAge: 30, priorOffice: [], requiresParty: false, residency: 'lga' },
  COUNCILLOR: { minAge: 25, priorOffice: [], requiresParty: false, residency: 'lga' },
  WARD_CHAIRMAN: { minAge: 25, priorOffice: [], requiresParty: false, residency: 'lga' },
};
const LIMITS = { minPartyDays: 2, maxTerms: { GOVERNOR: 2, PRESIDENT: 2 } };
const base: OfficeCandidate = { age: 40, homeStateCode: 'LA', homeLgaId: 'LA-011', partyCode: 'PUP', partyDays: 10, pastOffices: [], termsServed: 0 };
const codes = (c: Partial<OfficeCandidate>, seat: Parameters<typeof checkEligibility>[1]) => checkEligibility({ ...base, ...c }, seat, RULES, LIMITS).reasons.map((r) => r.code);

describe('office eligibility', () => {
  const gov = { kind: 'GOVERNOR' as const, stateCode: 'LA', lgaId: null };
  const lgc = { kind: 'LG_CHAIRMAN' as const, stateCode: 'LA', lgaId: 'LA-011' };
  const pres = { kind: 'PRESIDENT' as const, stateCode: null, lgaId: null };

  it('accepts a qualified candidate', () => {
    expect(checkEligibility(base, gov, RULES, LIMITS)).toEqual({ eligible: true, reasons: [] });
  });

  it('enforces minimum age per office', () => {
    expect(codes({ age: 30 }, gov)).toEqual(['too_young']);
    expect(codes({ age: 30 }, lgc)).toEqual([]);
    expect(codes({ age: 29 }, lgc)).toEqual(['too_young']);
  });

  it('requires a prior office where the rule says so', () => {
    expect(codes({}, pres)).toEqual(['no_prior_office']);
    expect(codes({ pastOffices: ['REP'] }, pres)).toEqual(['no_prior_office']);
    expect(codes({ pastOffices: ['REP', 'SENATOR'] }, pres)).toEqual([]);
  });

  it('requires real party membership, held long enough, where the rule says so', () => {
    expect(codes({ partyCode: null }, gov)).toEqual(['needs_party']);
    expect(codes({ partyCode: 'IND' }, gov)).toEqual(['needs_party']);
    expect(codes({ partyDays: 1 }, gov)).toEqual(['party_too_new']);
    // independents may run for local seats
    expect(codes({ partyCode: null }, lgc)).toEqual([]);
  });

  it('checks home state and home LGA', () => {
    expect(codes({ homeStateCode: 'OY', homeLgaId: 'OY-001' }, gov)).toEqual(['wrong_state']);
    expect(codes({ homeLgaId: 'LA-012' }, lgc)).toEqual(['wrong_lga']);
    expect(codes({ homeStateCode: 'OY' }, { kind: 'REP', stateCode: 'LA', lgaId: null })).toEqual(['wrong_state']);
  });

  it('term limits: Governor and President max 2 terms, other offices unlimited', () => {
    expect(codes({ termsServed: 1 }, gov)).toEqual([]);
    expect(codes({ termsServed: 2 }, gov)).toEqual(['term_limit']);
    expect(codes({ termsServed: 2, pastOffices: ['GOVERNOR'] }, pres)).toEqual(['term_limit']);
    expect(codes({ termsServed: 9 }, { kind: 'SENATOR', stateCode: 'LA', lgaId: null })).toEqual([]);
  });

  it('lists every failed rule with a readable message', () => {
    const e = checkEligibility({ ...base, age: 26, partyCode: null, homeStateCode: 'KN', termsServed: 2 }, gov, RULES, LIMITS);
    expect(e.eligible).toBe(false);
    expect(e.reasons.map((r) => r.code)).toEqual(['too_young', 'needs_party', 'wrong_state', 'term_limit']);
    for (const r of e.reasons) expect(r.message.length).toBeGreaterThan(10);
  });
});

describe('inactivity', () => {
  const DAY = 86_400_000;
  const cfg = { autopilotAfterDays: 3, vacancyAfterDays: 10 };
  it('is active, then on autopilot, then loses the seat', () => {
    expect(activityStatus(0, 2.9 * DAY, cfg)).toBe('active');
    expect(activityStatus(0, 3 * DAY, cfg)).toBe('autopilot');
    expect(activityStatus(0, 9.9 * DAY, cfg)).toBe('autopilot');
    expect(activityStatus(0, 10 * DAY, cfg)).toBe('vacate');
  });
});

describe('succession', () => {
  it('maps principals to deputies and back', () => {
    expect(deputySeatOf('PRES')).toBe('VP');
    expect(deputySeatOf('GOV-LA')).toBe('DGOV-LA');
    expect(deputySeatOf('SEN-LA-SD1')).toBeNull();
    expect(principalSeatOf('VP')).toBe('PRES');
    expect(principalSeatOf('DGOV-KN')).toBe('GOV-KN');
    expect(principalSeatOf('GOV-KN')).toBeNull();
  });

  it('deputy steps up for President/Governor; deputies are appointed; everything else goes to a by-election', () => {
    expect(vacancyPlan('GOV-LA', true)).toBe('succession');
    expect(vacancyPlan('GOV-LA', false)).toBe('by_election');
    expect(vacancyPlan('PRES', true)).toBe('succession');
    expect(vacancyPlan('DGOV-LA', true)).toBe('appoint');
    expect(vacancyPlan('VP', false)).toBe('appoint');
    expect(vacancyPlan('REP-LA-FC01', false)).toBe('by_election');
    expect(vacancyPlan('CLR-LA-011-W01', false)).toBe('by_election');
  });
});

describe('NPC office-holder decisions', () => {
  const saint = { integrity: 90, greed: 10, loyalty: 60, ambition: 70 };
  const crook = { integrity: 10, greed: 90, loyalty: 60, ambition: 30 };
  const levels: InsecurityLevels = { banditry: 60, kidnapping: 50, farmer_herder: 40, communal: 30, militancy: 10, urban_crime: 30 };

  it('governor: honest NPCs fund security, greedy NPCs divert it', () => {
    const good = npcGovernorSecurity(saint, levels, new Rng('g'));
    const bad = npcGovernorSecurity(crook, levels, new Rng('g'));
    expect(good.policy.diversion).toBe(0);
    expect(bad.policy.diversion).toBeGreaterThanOrEqual(0.4);
    expect(good.policy.securityBudget).toBeGreaterThan(bad.policy.securityBudget);
    expect(good.decision).toBe('security_push');
    expect(bad.decision).toBe('divert');
    for (const v of Object.values(bad.policy)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('governor decisions change where insecurity goes over two years', () => {
    const run = (p: typeof saint) => {
      let l = levels;
      const rng = new Rng('state');
      for (let m = 0; m < 24; m++) l = tickInsecurity(l, npcGovernorSecurity(p, l, rng.fork(`d${m}`)).policy, 50, rng.fork(`t${m}`));
      return averageInsecurity(l);
    };
    expect(run(saint)).toBeLessThan(run(crook) - 5);
  });

  it('president: corruption follows greed over integrity; ambition drives spending', () => {
    const good = npcPresidentEconomy(saint, new Rng('p'));
    const bad = npcPresidentEconomy(crook, new Rng('p'));
    expect(good.inputs.corruption).toBeLessThan(30);
    expect(bad.inputs.corruption).toBeGreaterThan(70);
    expect(good.inputs.spending).toBeGreaterThan(bad.inputs.spending);
    expect(npcPresidentEconomy({ ...crook, ambition: 10 }, new Rng('p')).decision).toBe('austerity');
    expect(npcPresidentEconomy({ ...saint, ambition: 95 }, new Rng('p')).decision).toBe('spend');
  });

  it('LG chairman: honest NPCs commission more projects, greedy ones divert more', () => {
    const tally = (p: typeof saint) => {
      const rng = new Rng('lg');
      const t = { project: 0, diverted: 0, none: 0 };
      for (let i = 0; i < 5000; i++) t[npcLocalDecision(p, rng)]++;
      return t;
    };
    const good = tally(saint);
    const bad = tally(crook);
    expect(good.project).toBeGreaterThan(bad.project * 1.5);
    expect(good.diverted).toBe(0);
    expect(bad.diverted).toBeGreaterThan(200);
  });

  it('decisions are deterministic for the same seed', () => {
    expect(npcGovernorSecurity(crook, levels, new Rng('x'))).toEqual(npcGovernorSecurity(crook, levels, new Rng('x')));
  });
});
