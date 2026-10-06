// Legacy score: five 0-100 components and a weighted total.
import { clamp } from './rng.js';
import type { CareerLevel } from './events/types.js';

export interface LegacyInput {
  /** Highest office ever held. */
  peakOffice: CareerLevel;
  /** Months spent in any office. */
  monthsInOffice: number;
  /** Bills passed, projects completed, crises handled well. */
  achievements: number;
  /** Net change in governed-unit metrics while in office (can be negative). */
  metricsImprovement: number;
  /** Integrity stat at the end, 0-100. */
  integrity: number;
  /** Naira stolen/diverted that the public knows about. */
  exposedCorruption: number;
  /** Naira stolen/diverted in total (hidden truth). */
  hiddenCorruption: number;
  /** Average approval over career, 0-100. */
  averageApproval: number;
  electionsWon: number;
  /** Net worth in naira. */
  netWorth: number;
}

export interface LegacyScore {
  impact: number;
  integrity: number;
  popularity: number;
  wealth: number;
  power: number;
  total: number;
}

const OFFICE_POWER: Record<CareerLevel, number> = {
  citizen: 0,
  lg_chairman: 25,
  rep: 35,
  senator: 50,
  deputy_governor: 45,
  governor: 70,
  vice_president: 75,
  president: 100,
};

const r = (n: number) => Math.round(clamp(n, 0, 100));

export function computeLegacy(i: LegacyInput): LegacyScore {
  const impact = r(i.achievements * 4 + i.metricsImprovement * 0.8 + Math.min(i.monthsInOffice, 96) * 0.2);
  // log scale so ₦100m and ₦10bn differ, but nothing goes below zero
  const corruptionPenalty = (n: number) => (n > 0 ? Math.log10(n) * 6 : 0);
  const integrity = r(i.integrity - corruptionPenalty(i.exposedCorruption) - corruptionPenalty(i.hiddenCorruption) * 0.5);
  const popularity = r(i.averageApproval * 0.8 + i.electionsWon * 4);
  const wealth = r(i.netWorth > 0 ? (Math.log10(i.netWorth) - 5) * 20 : 0); // ₦100k → 0, ₦10bn → 100
  const power = r(OFFICE_POWER[i.peakOffice] * 0.8 + Math.min(i.monthsInOffice, 120) / 6);
  const total = Math.round(impact * 0.3 + integrity * 0.2 + popularity * 0.2 + wealth * 0.1 + power * 0.2);
  return { impact, integrity, popularity, wealth, power, total };
}
