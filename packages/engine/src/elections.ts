// Result declaration rules per office.
import type { Rng } from './rng.js';

/** Votes per candidate in one sub-unit (LGA for governor, state/FCT for president). */
export type UnitVotes = Record<string, number>;

export type TiePolicy = 'rerun' | 'lot';

export type Declaration =
  | { status: 'winner'; winner: string; totals: Record<string, number>; tiebreak?: 'lot' }
  | { status: 'runoff'; candidates: [string, string]; totals: Record<string, number>; reason: string }
  | { status: 'rerun'; tied: string[]; totals: Record<string, number>; reason: string }
  | { status: 'no_votes'; totals: Record<string, number> };

export function sumVotes(units: UnitVotes[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const u of units) for (const [c, v] of Object.entries(u)) totals[c] = (totals[c] ?? 0) + v;
  return totals;
}

/** Candidates sorted by votes, descending; ties keep id order for determinism. */
export function ranked(totals: Record<string, number>): string[] {
  return Object.keys(totals).sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b));
}

/** Candidates sharing the top vote count. */
function leaders(totals: Record<string, number>): string[] {
  const order = ranked(totals);
  const top = totals[order[0] ?? ''] ?? 0;
  return order.filter((c) => totals[c] === top);
}

/** Number of units where `candidate` got at least `fraction` of that unit's votes. */
export function unitsWithShare(units: UnitVotes[], candidate: string, fraction = 0.25): number {
  let n = 0;
  for (const u of units) {
    const total = Object.values(u).reduce((a, b) => a + b, 0);
    if (total > 0 && (u[candidate] ?? 0) / total >= fraction) n++;
  }
  return n;
}

function resolveTie(tied: string[], totals: Record<string, number>, policy: TiePolicy, rng?: Rng): Declaration {
  if (policy === 'lot') {
    if (!rng) throw new Error('lot tiebreak needs an rng');
    return { status: 'winner', winner: rng.pick([...tied].sort()), totals, tiebreak: 'lot' };
  }
  return { status: 'rerun', tied: [...tied].sort(), totals, reason: 'Tie for first place: fresh election required.' };
}

/** Reps, Senate, LG Chairman: highest total wins. */
export function declarePlurality(units: UnitVotes[], opts: { tie?: TiePolicy; rng?: Rng } = {}): Declaration {
  const totals = sumVotes(units);
  const top = leaders(totals);
  if (!top.length || (totals[top[0] as string] ?? 0) === 0) return { status: 'no_votes', totals };
  if (top.length > 1) return resolveTie(top, totals, opts.tie ?? 'rerun', opts.rng);
  return { status: 'winner', winner: top[0] as string, totals };
}

/** At least two-thirds of n, rounded up (17 LGAs → 12). */
export function twoThirdsOf(n: number): number {
  return Math.ceil((2 * n) / 3);
}

/**
 * Spread-requirement rule shared by Governor and President: the leader wins only if they also have
 * ≥25% in at least `required` units; otherwise a run-off between the leader and the best qualifying runner-up
 * (the other candidate with ≥25% in the most units, ties broken by total votes).
 */
function declareWithSpread(units: UnitVotes[], required: number, label: string, opts: { tie?: TiePolicy; rng?: Rng }): Declaration {
  const totals = sumVotes(units);
  const top = leaders(totals);
  if (!top.length || (totals[top[0] as string] ?? 0) === 0) return { status: 'no_votes', totals };
  if (top.length > 1) return resolveTie(top, totals, opts.tie ?? 'rerun', opts.rng);
  const leader = top[0] as string;
  const leaderSpread = unitsWithShare(units, leader);
  if (leaderSpread >= required) return { status: 'winner', winner: leader, totals };

  const others = ranked(totals).filter((c) => c !== leader);
  const runnerUp = others.sort((a, b) => unitsWithShare(units, b) - unitsWithShare(units, a) || (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b))[0];
  if (!runnerUp) return { status: 'winner', winner: leader, totals };
  return {
    status: 'runoff',
    candidates: [leader, runnerUp],
    totals,
    reason: `${leader} led but had 25% in only ${leaderSpread} of ${units.length} ${label} (needed ${required}).`,
  };
}

/** Governor: most votes and ≥25% in at least two-thirds of the state's LGAs. `lgas` = one entry per LGA. */
export function declareGovernor(lgas: UnitVotes[], opts: { tie?: TiePolicy; rng?: Rng } = {}): Declaration {
  return declareWithSpread(lgas, twoThirdsOf(lgas.length), 'LGAs', opts);
}

/** President: most votes and ≥25% in at least 24 of the 37 units (36 states + FCT). */
export const PRESIDENT_SPREAD_REQUIRED = 24;
export function declarePresident(states: UnitVotes[], opts: { tie?: TiePolicy; rng?: Rng; required?: number } = {}): Declaration {
  return declareWithSpread(states, opts.required ?? PRESIDENT_SPREAD_REQUIRED, 'states + FCT', opts);
}

/** Run-off: simple majority between the two candidates. */
export function declareRunoff(units: UnitVotes[], opts: { tie?: TiePolicy; rng?: Rng } = {}): Declaration {
  return declarePlurality(units, opts);
}
