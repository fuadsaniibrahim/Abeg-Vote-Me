import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';
import { BRIBE_TARGET_KINDS, acceptChance, attemptBribe, bribePrice, detectionChance, type BribeAttempt, type BribeTarget } from '../src/bribery.js';

const target = (over: Partial<BribeTarget> = {}): BribeTarget => ({ kind: 'delegate', integrity: 40, greed: 60, loyalty: 60, ambition: 40, ...over });
const attempt = (over: Partial<BribeAttempt> = {}): BribeAttempt => ({
  target: target(),
  offer: 1_000_000,
  method: 'cash',
  briberConnections: 50,
  peopleInTheKnow: 0,
  activeInvestigators: 0,
  ...over,
});

function rate(a: BribeAttempt, pred: (r: ReturnType<typeof attemptBribe>) => boolean, n = 3000) {
  let k = 0;
  for (let i = 0; i < n; i++) if (pred(attemptBribe(a, new Rng(i)))) k++;
  return k / n;
}

describe('bribe price', () => {
  it('covers every target kind from the spec, with judges costing more than voters', () => {
    expect(BRIBE_TARGET_KINDS).toEqual(expect.arrayContaining(['voter', 'delegate', 'official', 'judge', 'journalist', 'party_executive', 'committee_chairman', 'probe_officer']));
    expect(bribePrice(target({ kind: 'judge' }))).toBeGreaterThan(bribePrice(target({ kind: 'voter' })) * 1000);
  });

  it('greedier and more principled targets cost more', () => {
    expect(bribePrice(target({ greed: 90 }))).toBeGreaterThan(bribePrice(target({ greed: 10 })));
    expect(bribePrice(target({ integrity: 80 }))).toBeGreaterThan(bribePrice(target({ integrity: 10 })));
  });
});

describe('acceptance', () => {
  it('some targets cannot be bought at any price', () => {
    expect(acceptChance(target({ integrity: 90 }), 1e12)).toBe(0);
    expect(rate(attempt({ target: target({ integrity: 90 }), offer: 1e12 }), (r) => r.result.startsWith('accepted'))).toBe(0);
  });

  it('bigger offers are accepted more often', () => {
    const t = target();
    expect(acceptChance(t, bribePrice(t) * 2)).toBeGreaterThan(acceptChance(t, bribePrice(t) * 0.5));
  });

  it('lowball offers to people with self-respect are an insult', () => {
    const t = target({ integrity: 60, greed: 20 });
    expect(rate(attempt({ target: t, offer: Math.floor(bribePrice(t) * 0.1) }), (r) => r.result === 'insulted')).toBeGreaterThan(0.9);
  });

  it('disloyal, ambitious targets sometimes take the money and blackmail you back', () => {
    const t = target({ integrity: 10, greed: 90, loyalty: 5, ambition: 95 });
    const r = rate(attempt({ target: t, offer: bribePrice(t) * 3 }), (x) => x.result === 'accepted_blackmail');
    expect(r).toBeGreaterThan(0.2);
    const loyal = target({ integrity: 10, greed: 90, loyalty: 100, ambition: 95 });
    expect(rate(attempt({ target: loyal, offer: bribePrice(loyal) * 3 }), (x) => x.result === 'accepted_blackmail')).toBe(0);
  });

  it('money only leaves the briber when the bribe is accepted', () => {
    for (let i = 0; i < 200; i++) {
      const r = attemptBribe(attempt(), new Rng(i));
      expect(r.moneySpent).toBe(r.result.startsWith('accepted') ? 1_000_000 : 0);
    }
  });

  it('rejects invalid offers', () => {
    expect(() => attemptBribe(attempt({ offer: 0 }), new Rng(1))).toThrow();
  });
});

describe('detection', () => {
  const base = attempt();
  it('rises with people in the know, investigators, bank transfers and target integrity', () => {
    const d0 = detectionChance(base, false);
    expect(detectionChance({ ...base, peopleInTheKnow: 5 }, false)).toBeGreaterThan(d0);
    expect(detectionChance({ ...base, activeInvestigators: 2 }, false)).toBeGreaterThan(d0);
    expect(detectionChance({ ...base, method: 'transfer' }, false)).toBeGreaterThan(d0);
    expect(detectionChance({ ...base, target: target({ integrity: 80 }) }, false)).toBeGreaterThan(d0);
  });

  it('falls with briber connections, rises when the target refuses', () => {
    expect(detectionChance({ ...base, briberConnections: 100 }, false)).toBeLessThan(detectionChance(base, false));
    expect(detectionChance(base, true)).toBeGreaterThan(detectionChance(base, false));
  });

  it('stays within 1%-95% and the observed rate matches the computed chance', () => {
    const extreme = { ...base, peopleInTheKnow: 50, activeInvestigators: 10, method: 'transfer' as const };
    expect(detectionChance(extreme, true)).toBe(0.95);
    expect(detectionChance({ ...base, briberConnections: 100, target: target({ integrity: 0 }) }, false)).toBeGreaterThanOrEqual(0.01);
    const a = attempt({ target: target({ integrity: 0, greed: 100 }), offer: 50_000_000, peopleInTheKnow: 3 });
    const expected = detectionChance(a, false);
    expect(Math.abs(rate(a, (r) => r.detected) - expected)).toBeLessThan(0.03);
  });
});
