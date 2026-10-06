// Bribery: every target has a price and a personality. Some take it, some refuse, some are insulted,
// some take it and blackmail you later. Every attempt has a detection chance.
import { Rng, clamp } from './rng.js';

export const BRIBE_TARGET_KINDS = [
  'voter',
  'delegate',
  'journalist',
  'official',
  'party_executive',
  'committee_chairman',
  'electoral_officer',
  'probe_officer',
  'judge',
] as const;
export type BribeTargetKind = (typeof BRIBE_TARGET_KINDS)[number];

/** Base price in naira for a "normal" target of each kind (greed 50). */
export const BASE_PRICE: Record<BribeTargetKind, number> = {
  voter: 5_000,
  delegate: 500_000,
  journalist: 300_000,
  official: 2_000_000,
  party_executive: 5_000_000,
  committee_chairman: 15_000_000,
  electoral_officer: 10_000_000,
  probe_officer: 20_000_000,
  judge: 50_000_000,
};

export interface BribeTarget {
  kind: BribeTargetKind;
  /** 0-100 */
  integrity: number;
  /** 0-100 */
  greed: number;
  /** 0-100: loyalty to the briber; low loyalty + high ambition → blackmail risk. */
  loyalty: number;
  /** 0-100 */
  ambition: number;
}

export interface BribeAttempt {
  target: BribeTarget;
  /** Naira offered. */
  offer: number;
  method: 'cash' | 'transfer';
  /** Briber's connections stat 0-100 (better middlemen, fewer leaks). */
  briberConnections: number;
  /** People who know about this deal besides briber and target. */
  peopleInTheKnow: number;
  /** Active investigations/journalists looking at the briber. */
  activeInvestigators: number;
}

export type BribeResult = 'accepted' | 'refused' | 'insulted' | 'accepted_blackmail';

export interface BribeOutcome {
  result: BribeResult;
  /** Whether the attempt was exposed / leaked this time. */
  detected: boolean;
  detectionChance: number;
  acceptChance: number;
  /** Whether the money left the briber (accepted outcomes only). */
  moneySpent: number;
}

/** Above this integrity a target can never be bought. */
export const UNBUYABLE_INTEGRITY = 85;

export function bribePrice(t: BribeTarget): number {
  const greedFactor = 0.5 + t.greed / 100; // 0.5..1.5
  const integrityFactor = 1 + t.integrity / 50; // 1..3
  return Math.round(BASE_PRICE[t.kind] * greedFactor * integrityFactor);
}

export function acceptChance(t: BribeTarget, offer: number): number {
  if (t.integrity >= UNBUYABLE_INTEGRITY || offer <= 0) return 0;
  const ratio = offer / bribePrice(t);
  // logistic in the offer/price ratio; greed shifts it up, integrity down
  const x = (ratio - 1) * 3 + (t.greed - 50) / 25 - (t.integrity - 50) / 25;
  return clamp(1 / (1 + Math.exp(-x)), 0, 0.97);
}

export function detectionChance(a: BribeAttempt, refused: boolean): number {
  const p =
    0.04 +
    0.03 * a.peopleInTheKnow +
    0.08 * a.activeInvestigators +
    (a.method === 'transfer' ? 0.12 : 0) +
    a.target.integrity / 400 +
    (refused ? 0.15 : 0) - // an honest refuser may report you
    a.briberConnections / 500;
  return clamp(p, 0.01, 0.95);
}

export function attemptBribe(a: BribeAttempt, rng: Rng): BribeOutcome {
  if (!Number.isInteger(a.offer) || a.offer <= 0) throw new RangeError('offer must be a positive whole number');
  const price = bribePrice(a.target);
  const pAccept = acceptChance(a.target, a.offer);
  let result: BribeResult;
  if (rng.chance(pAccept)) {
    const blackmailRisk = clamp(((100 - a.target.loyalty) / 100) * (a.target.ambition / 100) * 0.5, 0, 0.5);
    result = rng.chance(blackmailRisk) ? 'accepted_blackmail' : 'accepted';
  } else {
    // a lowball offer to someone with some self-respect is an insult
    result = a.offer < price * 0.4 && a.target.integrity >= 40 ? 'insulted' : 'refused';
  }
  const refused = result === 'refused' || result === 'insulted';
  const dc = detectionChance(a, refused);
  return {
    result,
    detected: rng.chance(dc),
    detectionChance: dc,
    acceptChance: pAccept,
    moneySpent: refused ? 0 : a.offer,
  };
}
