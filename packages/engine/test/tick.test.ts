import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate.js';
import { INITIAL_ECONOMY } from '../src/economy.js';
import { NEUTRAL_POLICY } from '../src/insecurity.js';
import { tickWorld, type WorldSimInputs, type WorldSimState } from '../src/tick.js';

const world = generateWorld('tick-test');
const initial: WorldSimState = {
  turn: 0,
  economy: INITIAL_ECONOMY,
  insecurity: Object.fromEntries(world.states.map((s) => [s.code, s.insecurity])),
  wealth: Object.fromEntries(world.states.map((s) => [s.code, s.wealth])),
  approval: 50,
};
const inputs: WorldSimInputs = { economy: { fuelSubsidy: false, corruption: 50, spending: 0, oilShock: 0 }, security: {} };

function runTicks(seed: string, n: number) {
  let s = initial;
  for (let i = 0; i < n; i++) s = tickWorld(s, inputs, seed);
  return s;
}

describe('world tick determinism', () => {
  it('same seed and inputs give an identical world after 24 ticks', () => {
    expect(runTicks('season-1', 24)).toEqual(runTicks('season-1', 24));
  });

  it('a different seed gives a different world', () => {
    expect(runTicks('season-1', 6)).not.toEqual(runTicks('season-2', 6));
  });

  it('resuming from a saved state matches an uninterrupted run (server restart safety)', () => {
    const mid = JSON.parse(JSON.stringify(runTicks('season-1', 10))) as WorldSimState;
    let resumed = mid;
    for (let i = 0; i < 14; i++) resumed = tickWorld(resumed, inputs, 'season-1');
    expect(resumed).toEqual(runTicks('season-1', 24));
  });

  it('advances the turn and keeps every state ticking', () => {
    const s = runTicks('season-1', 3);
    expect(s.turn).toBe(3);
    expect(Object.keys(s.insecurity)).toHaveLength(37);
    expect(inputs.security.LA ?? NEUTRAL_POLICY).toBe(NEUTRAL_POLICY);
  });
});
