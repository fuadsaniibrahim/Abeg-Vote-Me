import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';
import { INITIAL_ECONOMY, NEUTRAL_INPUTS, tickEconomy, type EconomyInputs, type EconomyState } from '../src/economy.js';

function run(months: number, inputs: EconomyInputs, seed = 'econ', start: EconomyState = INITIAL_ECONOMY) {
  const rng = new Rng(seed);
  let s = start;
  const history = [s];
  for (let i = 0; i < months; i++) {
    s = tickEconomy(s, inputs, rng);
    history.push(s);
  }
  return { s, history };
}

describe('economy tick', () => {
  it('is deterministic for the same seed', () => {
    expect(run(24, NEUTRAL_INPUTS, 'a').s).toEqual(run(24, NEUTRAL_INPUTS, 'a').s);
  });

  it('inflation converges toward ~15% under neutral inputs and stays bounded over 10 years', () => {
    const { s, history } = run(120, NEUTRAL_INPUTS);
    expect(s.inflation).toBeGreaterThan(10);
    expect(s.inflation).toBeLessThan(20);
    for (const h of history) {
      expect(h.inflation).toBeGreaterThanOrEqual(0);
      expect(h.inflation).toBeLessThanOrEqual(80);
      expect(h.fuelPrice).toBeGreaterThan(0);
      expect(h.exchangeRate).toBeGreaterThan(0);
    }
  });

  it('spending sprees and insecurity raise inflation versus austerity and peace', () => {
    const hot = run(36, { ...NEUTRAL_INPUTS, spending: 1, insecurity: 80, corruption: 80 }).s;
    const cool = run(36, { ...NEUTRAL_INPUTS, spending: -1, insecurity: 10, corruption: 20 }).s;
    expect(hot.inflation).toBeGreaterThan(cool.inflation + 10);
    expect(hot.foodIndex).toBeGreaterThan(cool.foodIndex);
  });

  it('fuel subsidy holds pump price far below the unsubsidised price', () => {
    const subsidy = run(12, { ...NEUTRAL_INPUTS, fuelSubsidy: true }).s;
    const market = run(12, { ...NEUTRAL_INPUTS, fuelSubsidy: false }).s;
    expect(subsidy.fuelPrice).toBeLessThan(market.fuelPrice * 0.6);
  });

  it('never moves fuel more than ~16% or the exchange rate more than ~8% in a single month', () => {
    const { history } = run(60, { ...NEUTRAL_INPUTS, oilShock: -1, corruption: 100, insecurity: 100, spending: 1 });
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1]!;
      const b = history[i]!;
      expect(Math.abs(b.fuelPrice - a.fuelPrice) / a.fuelPrice).toBeLessThan(0.17);
      expect(Math.abs(b.exchangeRate - a.exchangeRate) / a.exchangeRate).toBeLessThan(0.081);
    }
  });
});
