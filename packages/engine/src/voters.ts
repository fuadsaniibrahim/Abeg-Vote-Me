// Voter model: blocs score candidates, turnout is simulated, NPC votes are drawn with seeded noise,
// and real player votes are added on top at full weight.
import type { Zone } from '@avm/data';
import { Rng, clamp } from './rng.js';
import { INSECURITY_TYPES, type Issue, type UnitProfile, type VoterBloc } from './world/types.js';

export interface Candidate {
  id: string;
  partyCode: string;
  /** 0-100 */
  charisma: number;
  /** 0-100 */
  publicImage: number;
  homeStateCode: string;
  homeZone: Zone;
  incumbent: boolean;
  /** Issues the candidate campaigns on (manifesto). */
  issues: Issue[];
  /** Campaign spending targeted at this unit, naira. */
  spend: number;
  /** Money given to voters as "logistics" in this unit, naira. */
  logistics?: number;
}

export interface UnitContext {
  stateCode: string;
  zone: Zone;
  profile: UnitProfile;
}

export const VOTER_WEIGHTS = {
  party: 3.0,
  issue: 1.2,
  region: 1.0,
  sameState: 0.6,
  incumbency: 0.6,
  money: 0.9,
  charisma: 1.0,
  image: 0.8,
  /** Softmax temperature: lower = blocs vote more decisively. */
  temperature: 1.0,
  /** Gaussian noise sd added to each bloc-candidate utility. */
  noise: 0.25,
};

/** Fraction of population that is a registered voter. */
export const REGISTERED_FRACTION = 0.5;

/** Diminishing returns on money: naira per head → 0..1. */
export function moneyEffect(nairaPerVoter: number): number {
  if (nairaPerVoter <= 0) return 0;
  return 1 - Math.exp(-nairaPerVoter / 400);
}

/** Utility of one candidate for one bloc (deterministic part). */
export function blocUtility(bloc: VoterBloc, c: Candidate, unit: UnitContext, registered: number): number {
  const w = VOTER_WEIGHTS;
  const leaning = unit.profile.leanings[c.partyCode] ?? 0;
  const party = w.party * bloc.partyLoyalty * leaning;
  const matches = bloc.topIssues.filter((i) => c.issues.includes(i)).length;
  const issue = w.issue * (matches / Math.max(1, bloc.topIssues.length));
  const region = w.region * bloc.regionalAlignment * (c.homeZone === unit.zone ? 1 : 0) + (c.homeStateCode === unit.stateCode ? w.sameState * bloc.regionalAlignment : 0);
  const incumbency = c.incumbent ? w.incumbency * bloc.incumbencyBias : 0;
  const perHead = (c.spend + (c.logistics ?? 0) * 2) / Math.max(1, registered);
  const money = w.money * bloc.moneySensitivity * moneyEffect(perHead);
  const charisma = w.charisma * bloc.charismaSensitivity * ((c.charisma - 50) / 50);
  const image = w.image * ((c.publicImage - 50) / 50);
  return party + issue + region + incumbency + money + charisma + image;
}

function softmax(xs: number[], t: number): number[] {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp((x - m) / t));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export interface TurnoutModifiers {
  /** -1..1 overall enthusiasm (campaign energy, high stakes). */
  enthusiasm?: number;
  /** Heavy rain / flood on election day. */
  badWeather?: boolean;
}

/** Turnout fraction of registered voters, 0.1-0.85. */
export function turnoutRate(profile: UnitProfile, mods: TurnoutModifiers = {}): number {
  const avgInsecurity = INSECURITY_TYPES.reduce((s, t) => s + profile.insecurity[t], 0) / INSECURITY_TYPES.length;
  const base = 0.38 + (mods.enthusiasm ?? 0) * 0.15 - (avgInsecurity - 30) * 0.004 - (mods.badWeather ? 0.06 : 0);
  return clamp(base, 0.1, 0.85);
}

export interface UnitResult {
  registered: number;
  turnout: number;
  /** Total votes cast (NPC + players). */
  totalVotes: number;
  /** Votes per candidate id (NPC + players). */
  votes: Record<string, number>;
  npcVotes: Record<string, number>;
  playerVotes: Record<string, number>;
}

/** Simulate one unit's NPC vote, then add real player votes on top. */
export function simulateUnit(
  unit: UnitContext,
  candidates: Candidate[],
  rng: Rng,
  opts: { turnout?: TurnoutModifiers; playerVotes?: Record<string, number>; populationShare?: number } = {},
): UnitResult {
  if (candidates.length === 0) throw new RangeError('simulateUnit needs at least one candidate');
  const registered = Math.round(unit.profile.population * (opts.populationShare ?? 1) * REGISTERED_FRACTION);
  const turnout = turnoutRate(unit.profile, opts.turnout);
  const npcVotes: Record<string, number> = Object.fromEntries(candidates.map((c) => [c.id, 0]));

  for (const bloc of unit.profile.blocs) {
    const voters = registered * bloc.share * clamp(turnout + rng.gaussian(0, 0.02), 0.05, 0.95);
    const utils = candidates.map((c) => blocUtility(bloc, c, unit, registered) + rng.gaussian(0, VOTER_WEIGHTS.noise));
    const shares = softmax(utils, VOTER_WEIGHTS.temperature);
    candidates.forEach((c, i) => {
      npcVotes[c.id] = (npcVotes[c.id] ?? 0) + voters * (shares[i] ?? 0);
    });
  }
  for (const id of Object.keys(npcVotes)) npcVotes[id] = Math.round(npcVotes[id] ?? 0);

  const playerVotes: Record<string, number> = {};
  for (const [id, n] of Object.entries(opts.playerVotes ?? {})) {
    if (!(id in npcVotes)) throw new RangeError(`player vote for unknown candidate ${id}`);
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`invalid player vote count ${n}`);
    playerVotes[id] = n;
  }
  const votes: Record<string, number> = {};
  for (const c of candidates) votes[c.id] = (npcVotes[c.id] ?? 0) + (playerVotes[c.id] ?? 0);
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
  return { registered, turnout, totalVotes, votes, npcVotes, playerVotes };
}
