import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';
import { declareGovernor, declarePlurality, declarePresident, declareRunoff, twoThirdsOf, unitsWithShare, type UnitVotes } from '../src/elections.js';

describe('plurality (Reps, Senate, LG Chairman)', () => {
  it('highest total across units wins, even without a majority', () => {
    const r = declarePlurality([{ a: 40, b: 35, c: 25 }, { a: 20, b: 10, c: 5 }]);
    expect(r).toMatchObject({ status: 'winner', winner: 'a', totals: { a: 60, b: 45, c: 30 } });
    // 60 of 135 votes: a plurality, not a majority
    expect(60 / 135).toBeLessThan(0.5);
  });

  it('picks b when b leads overall', () => {
    expect(declarePlurality([{ a: 10, b: 30 }])).toMatchObject({ status: 'winner', winner: 'b' });
  });

  it('reports no_votes when nobody voted', () => {
    expect(declarePlurality([{ a: 0, b: 0 }]).status).toBe('no_votes');
  });
});

describe('ties', () => {
  it('default policy orders a rerun between the tied candidates', () => {
    const r = declarePlurality([{ b: 50, a: 50, c: 10 }]);
    expect(r).toMatchObject({ status: 'rerun', tied: ['a', 'b'] });
  });

  it('lot policy picks a winner deterministically from the seed', () => {
    const r1 = declarePlurality([{ a: 50, b: 50 }], { tie: 'lot', rng: new Rng('lot') });
    const r2 = declarePlurality([{ a: 50, b: 50 }], { tie: 'lot', rng: new Rng('lot') });
    expect(r1.status).toBe('winner');
    expect(r1).toEqual(r2);
    expect(r1).toMatchObject({ tiebreak: 'lot' });
  });

  it('lot policy without an rng throws', () => {
    expect(() => declarePlurality([{ a: 1, b: 1 }], { tie: 'lot' })).toThrow();
  });
});

describe('governor rule', () => {
  it('twoThirdsOf rounds up', () => {
    expect(twoThirdsOf(17)).toBe(12);
    expect(twoThirdsOf(21)).toBe(14);
    expect(twoThirdsOf(44)).toBe(30);
    expect(twoThirdsOf(3)).toBe(2);
  });

  it('leader with 25% in two-thirds of LGAs wins', () => {
    // 3 LGAs → need 2. a has ≥25% in all three.
    const lgas: UnitVotes[] = [{ a: 50, b: 50 }, { a: 30, b: 20 }, { a: 60, b: 40 }];
    expect(declareGovernor(lgas)).toMatchObject({ status: 'winner', winner: 'a' });
  });

  it('leader without the spread goes to a run-off with the best qualifying runner-up', () => {
    // a wins big in one LGA but <25% in the other two. 3 LGAs → need 2.
    const lgas: UnitVotes[] = [{ a: 1000, b: 10, c: 5 }, { a: 10, b: 60, c: 30 }, { a: 10, b: 50, c: 40 }];
    const r = declareGovernor(lgas);
    expect(r.status).toBe('runoff');
    if (r.status === 'runoff') expect(r.candidates).toEqual(['a', 'b']);
  });

  it('exactly 25% counts as meeting the threshold', () => {
    expect(unitsWithShare([{ a: 25, b: 75 }], 'a')).toBe(1);
    expect(unitsWithShare([{ a: 24, b: 76 }], 'a')).toBe(0);
  });
});

describe('president rule', () => {
  /** 37 units; `a` gets 25%+ in `spreadA` of them. */
  function national(spreadA: number): UnitVotes[] {
    return Array.from({ length: 37 }, (_, i) => (i < spreadA ? { a: 300, b: 400, c: 300 } : { a: 100, b: 600, c: 300 }));
  }

  it('candidate with most votes and 25% in 24 of 37 wins', () => {
    const units = national(24);
    units[0] = { a: 100_000, b: 1, c: 1 }; // a also has the most votes
    expect(declarePresident(units)).toMatchObject({ status: 'winner', winner: 'a' });
  });

  it('most votes but only 23 qualifying units forces a run-off with the best qualifying runner-up', () => {
    const units = national(23);
    units[0] = { a: 100_000, b: 1, c: 1 };
    const r = declarePresident(units);
    expect(r.status).toBe('runoff');
    if (r.status === 'runoff') {
      expect(r.candidates[0]).toBe('a');
      // b has 25%+ in 36 units, c has 25%+ in 36 units; b has more votes so b is chosen
      expect(r.candidates[1]).toBe('b');
      expect(r.reason).toMatch(/needed 24/);
    }
  });

  it('runner-up is chosen by spread first, not by votes', () => {
    // Units 0-4: b dominates (c under 25%). Units 5-35: c dominates (b under 25%). Unit 36: a only.
    const units: UnitVotes[] = Array.from({ length: 37 }, (_, i) => (i < 5 ? { a: 100, b: 10_000, c: 900 } : { a: 100, b: 100, c: 800 }));
    units[36] = { a: 900_000, b: 0, c: 0 };
    const totals = { a: 0, b: 0, c: 0 };
    for (const u of units) for (const k of ['a', 'b', 'c'] as const) totals[k] += u[k] ?? 0;
    // precondition: b has MORE votes than c, but c has 25%+ in far more units
    expect(totals.b).toBeGreaterThan(totals.c);
    expect(unitsWithShare(units, 'c')).toBe(31);
    expect(unitsWithShare(units, 'b')).toBe(5);
    expect(unitsWithShare(units, 'a')).toBe(1);
    const r = declarePresident(units);
    expect(r.status).toBe('runoff');
    if (r.status === 'runoff') expect(r.candidates).toEqual(['a', 'c']);
  });

  it('run-off is decided by simple majority between the two', () => {
    expect(declareRunoff([{ a: 10, b: 20 }, { a: 15, b: 1 }])).toMatchObject({ status: 'winner', winner: 'a' });
  });
});
