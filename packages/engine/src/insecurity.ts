// Insecurity per region and type, ticked monthly from policy levers. Effects are expressed as
// statistics (farm output, prices, attendance, turnout), never as graphic descriptions.
import { Rng, clamp } from './rng.js';
import { INSECURITY_TYPES, type InsecurityType } from './world/types.js';

export type InsecurityLevels = Record<InsecurityType, number>;

/** Policy levers, each 0-1 (share of what a well-run state would commit). */
export interface SecurityPolicy {
  securityBudget: number;
  troopDeployment: number;
  intelligence: number;
  vigilanteSupport: number;
  communityPolicing: number;
  amnesty: number;
  youthPrograms: number;
  borderControl: number;
  /** 0-1 share of the security vote diverted (corruption). Cancels part of the budget's effect. */
  diversion: number;
}

export const NEUTRAL_POLICY: SecurityPolicy = {
  securityBudget: 0.5,
  troopDeployment: 0.5,
  intelligence: 0.5,
  vigilanteSupport: 0.3,
  communityPolicing: 0.4,
  amnesty: 0.2,
  youthPrograms: 0.4,
  borderControl: 0.4,
  diversion: 0,
};

type Lever = Exclude<keyof SecurityPolicy, 'diversion'>;

/** How strongly each lever (above its neutral value) suppresses each insecurity type per month. */
const SENSITIVITY: Record<InsecurityType, Partial<Record<Lever, number>>> = {
  banditry: { securityBudget: 3, troopDeployment: 4, intelligence: 3, vigilanteSupport: 2, borderControl: 2, youthPrograms: 1 },
  kidnapping: { securityBudget: 3, intelligence: 4, communityPolicing: 3, troopDeployment: 1, youthPrograms: 1 },
  farmer_herder: { communityPolicing: 3, intelligence: 2, troopDeployment: 2, youthPrograms: 1, amnesty: 1 },
  communal: { communityPolicing: 4, youthPrograms: 2, intelligence: 1 },
  militancy: { amnesty: 4, youthPrograms: 3, troopDeployment: 2, intelligence: 1 },
  urban_crime: { communityPolicing: 3, youthPrograms: 3, securityBudget: 2, intelligence: 1 },
};

/**
 * One monthly tick. `poverty` (0-100) pushes every type up; levers push down relative to the
 * neutral policy; diversion removes part of the budget and deployment effect. Vigilante support
 * helps against banditry but slightly raises communal tension.
 */
export function tickInsecurity(levels: InsecurityLevels, policy: SecurityPolicy, poverty: number, rng: Rng): InsecurityLevels {
  const effective: SecurityPolicy = {
    ...policy,
    securityBudget: policy.securityBudget * (1 - policy.diversion),
    troopDeployment: policy.troopDeployment * (1 - policy.diversion * 0.5),
  };
  const out = {} as InsecurityLevels;
  for (const t of INSECURITY_TYPES) {
    const pressure = (poverty - 50) * 0.04 + 0.3; // slow upward drift when nothing is done
    let suppression = 0;
    for (const [lever, k] of Object.entries(SENSITIVITY[t]) as [Lever, number][]) {
      suppression += (effective[lever] - NEUTRAL_POLICY[lever]) * k;
    }
    const sideEffect = t === 'communal' ? (policy.vigilanteSupport - NEUTRAL_POLICY.vigilanteSupport) * 2 : 0;
    // levels near 0 resist going lower, levels near 100 resist going higher
    const room = levels[t] < 50 ? levels[t] / 50 : (100 - levels[t]) / 50;
    const delta = (pressure - suppression + sideEffect) * (0.4 + 0.6 * room) + rng.gaussian(0, 1);
    out[t] = Math.round(clamp(levels[t] + delta, 0, 100) * 10) / 10;
  }
  return out;
}

export function averageInsecurity(levels: InsecurityLevels): number {
  return INSECURITY_TYPES.reduce((s, t) => s + levels[t], 0) / INSECURITY_TYPES.length;
}

export interface InsecurityEffects {
  /** Multiplier on farm output, 0.4-1. */
  farmOutput: number;
  /** Extra monthly food price pressure, fraction (e.g. 0.01 = +1%). */
  foodPricePressure: number;
  /** School attendance fraction 0.3-1. */
  schoolAttendance: number;
  /** Investment confidence multiplier 0.3-1. */
  investment: number;
  /** Turnout penalty in fraction points (0-0.25). */
  turnoutPenalty: number;
  /** Whether a public rally can be held safely without heavy security. */
  rallySafe: boolean;
}

export function insecurityEffects(levels: InsecurityLevels): InsecurityEffects {
  const avg = averageInsecurity(levels);
  const rural = (levels.banditry + levels.farmer_herder + levels.kidnapping) / 3;
  return {
    farmOutput: clamp(1 - rural / 170, 0.4, 1),
    foodPricePressure: Math.max(0, (rural - 30) / 3000),
    schoolAttendance: clamp(1 - (levels.banditry + levels.kidnapping) / 280, 0.3, 1),
    investment: clamp(1 - avg / 140, 0.3, 1),
    turnoutPenalty: clamp((avg - 30) / 280, 0, 0.25),
    rallySafe: Math.max(...INSECURITY_TYPES.map((t) => levels[t])) < 70,
  };
}
