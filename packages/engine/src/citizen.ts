// Citizen action outcomes: energy, rallies, protests, business income.
import { BUSINESS_SECTORS, type BusinessSector } from '@avm/data';
import { Rng, clamp } from './rng.js';
import type { StatMods, Stats } from './stats.js';

// ---------- energy ----------

export const MAX_ENERGY = 100;

/** Energy regenerated per real hour: 5 + stamina/10 (5-15). */
export function energyRegenPerHour(stamina: number): number {
  return 5 + clamp(stamina, 0, 100) / 10;
}

export function currentEnergy(stored: number, updatedAtMs: number, nowMs: number, stamina: number): number {
  const hours = Math.max(0, nowMs - updatedAtMs) / 3_600_000;
  return Math.min(MAX_ENERGY, stored + hours * energyRegenPerHour(stamina));
}

export const ACTION_ENERGY = { rally: 15, protest: 25, story: 20 } as const;

// ---------- rally ----------

export interface ActionOutcome {
  /** Short Pidgin-flavoured line for the UI. */
  text: string;
  mods: StatMods;
  /** Naira lost (fines, damages). Always >= 0. */
  cost: number;
  /** Tag for analytics/news, e.g. 'great', 'rain', 'detained'. */
  tag: string;
}

export function rallyOutcome(stats: Stats, rng: Rng): ActionOutcome {
  const roll = rng.next() + (stats.charisma - 50) / 250;
  if (roll < 0.12) return { text: 'Rain fall halfway. Everybody run for shelter. At least you try.', mods: { stamina: -1 }, cost: 0, tag: 'rain' };
  if (roll < 0.75) return { text: 'Good rally. People hear your name, small small.', mods: { publicImage: 1, connections: 1 }, cost: 0, tag: 'good' };
  return { text: 'The crowd carry you for shoulder! Your name dey trend for the area.', mods: { publicImage: 2, connections: 1, charisma: 1 }, cost: 0, tag: 'great' };
}

// ---------- protest ----------

/**
 * Joining a protest: reward is public image (and integrity for standing up); risk scales with local
 * insecurity. Detention is brief and non-graphic: a fine and lost energy.
 */
export function protestOutcome(stats: Stats, localInsecurity: number, rng: Rng): ActionOutcome {
  const pDetain = clamp(0.05 + localInsecurity / 400 - stats.connections / 1000, 0.02, 0.35);
  const pTearGas = 0.15;
  const r = rng.next();
  if (r < pDetain) {
    return { text: 'Police pack una for station. Your lawyer settle am, but e cost you.', mods: { publicImage: 2, stamina: -2 }, cost: 50_000, tag: 'detained' };
  }
  if (r < pDetain + pTearGas) {
    return { text: 'Tear gas scatter the crowd. You comot with your eyes dey pepper.', mods: { publicImage: 1, stamina: -1 }, cost: 0, tag: 'teargas' };
  }
  return { text: 'Peaceful protest. Your voice dey among the people, and cameras catch am.', mods: { publicImage: 2, integrity: 1 }, cost: 0, tag: 'peaceful' };
}

// ---------- business ----------

export function getSector(id: string): BusinessSector | undefined {
  return BUSINESS_SECTORS.find((s) => s.id === id);
}

/** Cost to start a business with a given capital; the businessperson perk gives 20% off. */
export function businessStartCost(capital: number, perks: string[]): number {
  return Math.round(perks.includes('business_discount') ? capital * 0.8 : capital);
}

export const MAX_ACTIVE_BUSINESSES = 3;

/**
 * Monthly income (never negative: a bad month earns 0). `economyFactor` ~1 normally;
 * <1 in recession/high insecurity. `intelligence` slightly improves management.
 */
export function monthlyBusinessIncome(sector: BusinessSector, capital: number, economyFactor: number, intelligence: number, rng: Rng): number {
  const luck = 1 + rng.gaussian(0, sector.volatility);
  const skill = 0.9 + clamp(intelligence, 0, 100) / 500; // 0.9-1.1
  return Math.max(0, Math.round(capital * sector.monthlyYield * clamp(economyFactor, 0, 2) * skill * luck));
}

/** Economy factor from inflation (%) and average insecurity (0-100): 1 at 15%/30, lower when worse. */
export function economyFactor(inflation: number, insecurity: number): number {
  return clamp(1 - (inflation - 15) / 100 - (insecurity - 30) / 200, 0.4, 1.3);
}
