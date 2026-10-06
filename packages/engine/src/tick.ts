// One monthly world tick for the shared simulation: economy + per-state insecurity + national approval.
import { Rng } from './rng.js';
import { tickEconomy, type EconomyInputs, type EconomyState } from './economy.js';
import { averageInsecurity, tickInsecurity, type InsecurityLevels, type SecurityPolicy, NEUTRAL_POLICY } from './insecurity.js';
import { tickApproval } from './approval.js';

export interface WorldSimState {
  turn: number;
  economy: EconomyState;
  /** State code → insecurity levels. */
  insecurity: Record<string, InsecurityLevels>;
  /** State code → wealth 0-100 (drives poverty pressure). */
  wealth: Record<string, number>;
  /** President's approval. */
  approval: number;
}

export interface WorldSimInputs {
  economy: Omit<EconomyInputs, 'insecurity'>;
  /** State code → policy; missing states use NEUTRAL_POLICY. */
  security: Record<string, SecurityPolicy>;
}

export function nationalInsecurity(insecurity: Record<string, InsecurityLevels>): number {
  const vals = Object.values(insecurity).map(averageInsecurity);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

/** Deterministic for a given (state, inputs, seed): each subsystem draws from its own forked stream. */
export function tickWorld(s: WorldSimState, inputs: WorldSimInputs, seed: string): WorldSimState {
  const root = new Rng(`${seed}/turn:${s.turn}`);
  const insecurity: Record<string, InsecurityLevels> = {};
  for (const code of Object.keys(s.insecurity).sort()) {
    insecurity[code] = tickInsecurity(s.insecurity[code] as InsecurityLevels, inputs.security[code] ?? NEUTRAL_POLICY, 100 - (s.wealth[code] ?? 50), root.fork(`sec:${code}`));
  }
  const before = nationalInsecurity(s.insecurity);
  const after = nationalInsecurity(insecurity);
  const economy = tickEconomy(s.economy, { ...inputs.economy, insecurity: after }, root.fork('econ'));
  const approval = tickApproval(s.approval, {
    securityDelta: before - after,
    economyDelta: (s.economy.inflation - economy.inflation) * 2,
  });
  return { turn: s.turn + 1, economy, insecurity, wealth: s.wealth, approval };
}
