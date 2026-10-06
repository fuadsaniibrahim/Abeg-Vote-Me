// Offices: eligibility, inactivity, succession and the basic decisions NPC office holders make each month.
import { Rng, clamp } from './rng.js';
import type { NpcPersonality, SeatKind } from './world/types.js';
import { averageInsecurity, type InsecurityLevels, type SecurityPolicy } from './insecurity.js';
import type { EconomyInputs } from './economy.js';

export const SEAT_KIND_LABELS: Record<SeatKind, string> = {
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice President',
  GOVERNOR: 'Governor',
  DEPUTY_GOVERNOR: 'Deputy Governor',
  SENATOR: 'Senator',
  REP: 'House of Reps member',
  LG_CHAIRMAN: 'LG Chairman',
  COUNCILLOR: 'Councillor',
  WARD_CHAIRMAN: 'Ward Chairman',
};

// ---------- eligibility ----------

export interface OfficeRule {
  minAge: number;
  /** If not empty, the candidate must have held one of these offices before. */
  priorOffice: SeatKind[];
  /** Must be a member of a real party (independents cannot run). */
  requiresParty: boolean;
  /** Where the candidate must be from: nowhere in particular, the seat's state, or the seat's LGA. */
  residency: 'none' | 'state' | 'lga';
}

export type OfficeRules = Record<SeatKind, OfficeRule>;

export interface EligibilityLimits {
  /** Days a candidate must have been in their party (only checked when the office requires a party). */
  minPartyDays: number;
  /** Max terms per kind of office; kinds not listed have no limit. */
  maxTerms: Partial<Record<string, number>>;
}

export interface OfficeCandidate {
  age: number;
  homeStateCode: string;
  homeLgaId: string;
  /** Current party code, or null for no party. */
  partyCode: string | null;
  /** Whole days in the current party. */
  partyDays: number;
  /** Kinds of every office held before or now. */
  pastOffices: readonly SeatKind[];
  /** Terms already served in offices of the target kind. */
  termsServed: number;
}

export interface SeatTarget {
  kind: SeatKind;
  stateCode: string | null;
  lgaId: string | null;
}

export type IneligibleCode = 'too_young' | 'no_prior_office' | 'needs_party' | 'party_too_new' | 'wrong_state' | 'wrong_lga' | 'term_limit';

export interface Eligibility {
  eligible: boolean;
  reasons: { code: IneligibleCode; message: string }[];
}

export function checkEligibility(c: OfficeCandidate, seat: SeatTarget, rules: OfficeRules, limits: EligibilityLimits): Eligibility {
  const rule = rules[seat.kind];
  const label = SEAT_KIND_LABELS[seat.kind];
  const reasons: Eligibility['reasons'] = [];
  if (c.age < rule.minAge) reasons.push({ code: 'too_young', message: `You must be at least ${rule.minAge} to be ${label}.` });
  if (rule.priorOffice.length && !c.pastOffices.some((k) => rule.priorOffice.includes(k))) {
    reasons.push({ code: 'no_prior_office', message: `To be ${label} you must first have served as ${rule.priorOffice.map((k) => SEAT_KIND_LABELS[k]).join(', ')}.` });
  }
  if (rule.requiresParty) {
    if (!c.partyCode || c.partyCode === 'IND') reasons.push({ code: 'needs_party', message: `Only party candidates can run for ${label}. Join a party first.` });
    else if (c.partyDays < limits.minPartyDays) reasons.push({ code: 'party_too_new', message: `You must be in your party for ${limits.minPartyDays} days before you can run.` });
  }
  if (rule.residency === 'state' && seat.stateCode && c.homeStateCode !== seat.stateCode) {
    reasons.push({ code: 'wrong_state', message: 'This seat is for people from the state. It is not your home state.' });
  }
  if (rule.residency === 'lga' && seat.lgaId && c.homeLgaId !== seat.lgaId) {
    reasons.push({ code: 'wrong_lga', message: 'This seat is for people from the LGA. It is not your home LGA.' });
  }
  const max = limits.maxTerms[seat.kind];
  if (max !== undefined && c.termsServed >= max) reasons.push({ code: 'term_limit', message: `You have already served ${c.termsServed} terms as ${label}. The limit is ${max}.` });
  return { eligible: reasons.length === 0, reasons };
}

// ---------- inactivity ----------

export type ActivityStatus = 'active' | 'autopilot' | 'vacate';

const DAY_MS = 86_400_000;

/** A holder who has not played for `autopilotAfterDays` goes on autopilot; after `vacancyAfterDays` they lose the seat. */
export function activityStatus(lastActiveMs: number, nowMs: number, cfg: { autopilotAfterDays: number; vacancyAfterDays: number }): ActivityStatus {
  const idle = nowMs - lastActiveMs;
  if (idle >= cfg.vacancyAfterDays * DAY_MS) return 'vacate';
  if (idle >= cfg.autopilotAfterDays * DAY_MS) return 'autopilot';
  return 'active';
}

// ---------- succession ----------

/** Seat id of the deputy for a President or Governor seat, else null. */
export function deputySeatOf(seatId: string): string | null {
  if (seatId === 'PRES') return 'VP';
  if (seatId.startsWith('GOV-')) return `DGOV-${seatId.slice(4)}`;
  return null;
}

/** Seat id of the principal for a Vice President or Deputy Governor seat, else null. */
export function principalSeatOf(seatId: string): string | null {
  if (seatId === 'VP') return 'PRES';
  if (seatId.startsWith('DGOV-')) return `GOV-${seatId.slice(5)}`;
  return null;
}

export type VacancyPlan = 'succession' | 'appoint' | 'by_election';

/**
 * What happens when a seat falls vacant: the deputy steps up for President/Governor (if there is one),
 * a deputy seat is filled by appointment, every other seat goes to a by-election.
 */
export function vacancyPlan(seatId: string, deputyHeld: boolean): VacancyPlan {
  if (principalSeatOf(seatId)) return 'appoint';
  if (deputySeatOf(seatId) && deputyHeld) return 'succession';
  return 'by_election';
}

// ---------- NPC office-holder decisions ----------

export type GovernorDecision = 'security_push' | 'steady' | 'divert';

/**
 * A governor NPC sets the state's security policy for the month. Integrity and ambition push spending up;
 * greed over integrity diverts part of the security vote. Worse insecurity gets more attention.
 */
export function npcGovernorSecurity(p: NpcPersonality, levels: InsecurityLevels, rng: Rng): { policy: SecurityPolicy; decision: GovernorDecision } {
  const concern = averageInsecurity(levels) / 100;
  const effort = (p.integrity - 50) / 200 + (p.ambition - 50) / 300 + concern * 0.3;
  const lever = (base: number, extra = 0) => Math.round(clamp(base + effort + extra + rng.gaussian(0, 0.04), 0.05, 0.95) * 100) / 100;
  const diversion = Math.round(clamp(((p.greed - p.integrity) / 100) * 0.6 + rng.gaussian(0, 0.03), 0, 0.6) * 100) / 100;
  const policy: SecurityPolicy = {
    securityBudget: lever(0.5),
    troopDeployment: lever(0.45, (levels.banditry / 100) * 0.15),
    intelligence: lever(0.45),
    vigilanteSupport: lever(0.25),
    communityPolicing: lever(0.4, (levels.communal / 100) * 0.1),
    amnesty: lever(0.2, (levels.militancy / 100) * 0.2),
    youthPrograms: lever(0.35),
    borderControl: lever(0.35),
    diversion,
  };
  const decision: GovernorDecision = diversion >= 0.25 ? 'divert' : policy.securityBudget >= 0.65 ? 'security_push' : 'steady';
  return { policy, decision };
}

export type PresidentDecision = 'spend' | 'austerity' | 'steady';

/** A president NPC's effect on the national economy: corruption tracks greed vs integrity; ambition drives spending. */
export function npcPresidentEconomy(p: NpcPersonality, rng: Rng): { inputs: Pick<EconomyInputs, 'corruption' | 'spending'>; decision: PresidentDecision } {
  const corruption = Math.round(clamp(50 + (p.greed - p.integrity) * 0.4 + rng.gaussian(0, 2), 10, 90));
  const spending = Math.round(clamp((p.ambition - 50) / 80 + rng.gaussian(0, 0.08), -0.6, 0.6) * 100) / 100;
  const decision: PresidentDecision = spending >= 0.2 ? 'spend' : spending <= -0.2 ? 'austerity' : 'steady';
  return { inputs: { corruption, spending }, decision };
}

export type LocalDecision = 'project' | 'diverted' | 'none';

/** An LG chairman NPC may commission a project or quietly divert funds in a given month. */
export function npcLocalDecision(p: NpcPersonality, rng: Rng): LocalDecision {
  const roll = rng.next();
  const project = 0.03 + (p.integrity / 100) * 0.07;
  const divert = Math.max(0, (p.greed - p.integrity) / 100) * 0.08;
  if (roll < project) return 'project';
  if (roll < project + divert) return 'diverted';
  return 'none';
}
