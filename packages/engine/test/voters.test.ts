import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate.js';
import { Rng } from '../src/rng.js';
import { blocUtility, moneyEffect, simulateUnit, turnoutRate, type Candidate, type UnitContext } from '../src/voters.js';
import type { UnitProfile } from '../src/world/types.js';

const world = generateWorld('voters-test');
const lga = world.lgas.find((l) => l.stateCode === 'KN')!;
const unit: UnitContext = { stateCode: 'KN', zone: 'NW', profile: lga };

const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  partyCode: 'NDA',
  charisma: 50,
  publicImage: 50,
  homeStateCode: 'LA',
  homeZone: 'SW',
  incumbent: false,
  issues: [],
  spend: 0,
  ...over,
});

function share(r: { votes: Record<string, number>; totalVotes: number }, id: string) {
  return (r.votes[id] ?? 0) / r.totalVotes;
}

/** Average vote share over many seeds to compare deterministic effects without noise. */
function avgShare(a: Candidate, b: Candidate, n = 40): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += share(simulateUnit(unit, [a, b], new Rng(`s${i}`)), a.id);
  return s / n;
}

describe('bloc utility factors', () => {
  const bloc = lga.blocs[0]!;
  const base = blocUtility(bloc, cand('a'), unit, 100_000);

  it('party leaning: a stronger party in this unit scores higher', () => {
    const strong = Object.entries(lga.leanings).filter(([p]) => p !== 'IND').sort((x, y) => y[1] - x[1])[0]![0];
    const weak = Object.entries(lga.leanings).filter(([p]) => p !== 'IND').sort((x, y) => x[1] - y[1])[0]![0];
    expect(blocUtility(bloc, cand('a', { partyCode: strong }), unit, 1e5)).toBeGreaterThan(blocUtility(bloc, cand('a', { partyCode: weak }), unit, 1e5));
  });

  it('issues, region, charisma, image and money each raise utility', () => {
    expect(blocUtility(bloc, cand('a', { issues: bloc.topIssues }), unit, 1e5)).toBeGreaterThan(base);
    expect(blocUtility(bloc, cand('a', { homeZone: 'NW', homeStateCode: 'KN' }), unit, 1e5)).toBeGreaterThan(base);
    expect(blocUtility(bloc, cand('a', { charisma: 90 }), unit, 1e5)).toBeGreaterThan(base);
    expect(blocUtility(bloc, cand('a', { publicImage: 90 }), unit, 1e5)).toBeGreaterThan(base);
    expect(blocUtility(bloc, cand('a', { spend: 50_000_000 }), unit, 1e5)).toBeGreaterThan(base);
  });

  it('incumbency follows the bloc bias sign', () => {
    const inc = blocUtility(bloc, cand('a', { incumbent: true }), unit, 1e5) - base;
    expect(Math.sign(inc)).toBe(Math.sign(bloc.incumbencyBias) || 0);
  });

  it('money has diminishing returns', () => {
    const first = moneyEffect(400) - moneyEffect(0);
    const second = moneyEffect(800) - moneyEffect(400);
    expect(second).toBeLessThan(first);
    expect(moneyEffect(1e9)).toBeLessThanOrEqual(1);
  });
});

describe('turnout', () => {
  it('falls with insecurity and bad weather, rises with enthusiasm, stays within 10-85%', () => {
    const calm: UnitProfile = { ...lga, insecurity: { banditry: 5, kidnapping: 5, farmer_herder: 5, communal: 5, militancy: 5, urban_crime: 5 } };
    const unsafe: UnitProfile = { ...lga, insecurity: { banditry: 95, kidnapping: 95, farmer_herder: 95, communal: 95, militancy: 95, urban_crime: 95 } };
    expect(turnoutRate(unsafe)).toBeLessThan(turnoutRate(calm));
    expect(turnoutRate(calm, { badWeather: true })).toBeLessThan(turnoutRate(calm));
    expect(turnoutRate(calm, { enthusiasm: 1 })).toBeGreaterThan(turnoutRate(calm));
    expect(turnoutRate(unsafe, { enthusiasm: -1, badWeather: true })).toBeGreaterThanOrEqual(0.1);
    expect(turnoutRate(calm, { enthusiasm: 1 })).toBeLessThanOrEqual(0.85);
  });
});

describe('simulateUnit', () => {
  const cands = [cand('a', { partyCode: 'PUP' }), cand('b', { partyCode: 'NDA' }), cand('c', { partyCode: 'PRM' })];

  it('is deterministic for the same seed and varies across seeds', () => {
    expect(simulateUnit(unit, cands, new Rng('x'))).toEqual(simulateUnit(unit, cands, new Rng('x')));
    expect(simulateUnit(unit, cands, new Rng('x')).votes).not.toEqual(simulateUnit(unit, cands, new Rng('y')).votes);
  });

  it('total NPC votes roughly equal registered voters × turnout', () => {
    const r = simulateUnit(unit, cands, new Rng('t'));
    const npcTotal = Object.values(r.npcVotes).reduce((a, b) => a + b, 0);
    expect(npcTotal / (r.registered * r.turnout)).toBeGreaterThan(0.9);
    expect(npcTotal / (r.registered * r.turnout)).toBeLessThan(1.1);
  });

  it('a clearly stronger candidate wins more of the vote on average', () => {
    const strong = cand('a', { charisma: 90, publicImage: 85, homeZone: 'NW', homeStateCode: 'KN', spend: 30_000_000 });
    const weak = cand('b', { charisma: 30, publicImage: 30 });
    expect(avgShare(strong, weak)).toBeGreaterThan(0.6);
  });

  it('adds real player votes at full weight on top of NPC votes', () => {
    const without = simulateUnit(unit, cands, new Rng('p'));
    const withPlayers = simulateUnit(unit, cands, new Rng('p'), { playerVotes: { b: 7 } });
    expect(withPlayers.votes.b).toBe((without.votes.b ?? 0) + 7);
    expect(withPlayers.votes.a).toBe(without.votes.a);
    expect(withPlayers.playerVotes).toEqual({ b: 7 });
    expect(withPlayers.totalVotes).toBe(without.totalVotes + 7);
  });

  it('rejects player votes for unknown candidates or invalid counts', () => {
    expect(() => simulateUnit(unit, cands, new Rng('p'), { playerVotes: { zz: 1 } })).toThrow(/unknown candidate/);
    expect(() => simulateUnit(unit, cands, new Rng('p'), { playerVotes: { a: -1 } })).toThrow(/invalid/);
  });

  it('scales registered voters by population share for split constituencies', () => {
    const half = simulateUnit(unit, cands, new Rng('h'), { populationShare: 0.5 });
    const full = simulateUnit(unit, cands, new Rng('h'));
    expect(Math.abs(half.registered * 2 - full.registered)).toBeLessThanOrEqual(1);
  });
});
