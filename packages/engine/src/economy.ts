// National economy, ticked monthly. Values mean-revert toward targets that policy and conditions shift,
// so the economy reacts to decisions without running away.
import { Rng, clamp } from './rng.js';

export interface EconomyState {
  /** Annual inflation, percent. */
  inflation: number;
  /** Petrol pump price, ₦ per litre. */
  fuelPrice: number;
  /** ₦ per US$. */
  exchangeRate: number;
  /** Food price index, 100 = baseline basket. */
  foodIndex: number;
}

export interface EconomyInputs {
  /** Fuel subsidy in place. */
  fuelSubsidy: boolean;
  /** Average national insecurity 0-100. */
  insecurity: number;
  /** Corruption perception 0-100 (higher = more corrupt). */
  corruption: number;
  /** Government spending pressure -1 (austerity) .. 1 (spree). */
  spending: number;
  /** Oil price shock -1 (crash) .. 1 (boom). */
  oilShock: number;
}

export const INITIAL_ECONOMY: EconomyState = { inflation: 22, fuelPrice: 650, exchangeRate: 1450, foodIndex: 100 };
export const NEUTRAL_INPUTS: EconomyInputs = { fuelSubsidy: false, insecurity: 35, corruption: 50, spending: 0, oilShock: 0 };

/** Per-month bounds so one tick never swings wildly. */
const MAX_MONTHLY = { fuel: 0.15, fx: 0.08, food: 0.06 };

export function tickEconomy(s: EconomyState, inp: EconomyInputs, rng: Rng): EconomyState {
  // Inflation target: baseline 15%, pushed by spending, insecurity (food supply), corruption, weak naira.
  const targetInflation = clamp(
    15 + inp.spending * 8 + (inp.insecurity - 35) * 0.15 + (inp.corruption - 50) * 0.08 - inp.oilShock * 3 + (inp.fuelSubsidy ? -2 : 0),
    2,
    60,
  );
  const inflation = clamp(s.inflation + (targetInflation - s.inflation) * 0.15 + rng.gaussian(0, 0.4), 0, 80);

  // Fuel: subsidy pins it near a regulated price; otherwise it tracks the exchange rate.
  const fuelTarget = inp.fuelSubsidy ? 300 : s.exchangeRate * 0.45 * (1 - inp.oilShock * 0.1);
  const fuelPrice = stepToward(s.fuelPrice, fuelTarget, 0.3, MAX_MONTHLY.fuel, rng.gaussian(0, 0.01));

  // Exchange rate drifts with inflation gap vs a 3% trading-partner rate, oil earnings and confidence.
  const fxDrift = (inflation - 3) / 12 / 100 - inp.oilShock * 0.01 + (inp.corruption - 50) * 0.0002 + (inp.insecurity - 35) * 0.0002;
  const exchangeRate = s.exchangeRate * (1 + clamp(fxDrift + rng.gaussian(0, 0.008), -MAX_MONTHLY.fx, MAX_MONTHLY.fx));

  // Food follows monthly inflation plus insecurity (farmers cannot reach farms) and fuel (transport).
  const foodGrowth = inflation / 12 / 100 + (inp.insecurity - 35) * 0.0004 + ((fuelPrice - s.fuelPrice) / s.fuelPrice) * 0.15;
  const foodIndex = s.foodIndex * (1 + clamp(foodGrowth + rng.gaussian(0, 0.004), -MAX_MONTHLY.food, MAX_MONTHLY.food));

  return {
    inflation: round(inflation, 2),
    fuelPrice: Math.round(fuelPrice),
    exchangeRate: Math.round(exchangeRate),
    foodIndex: round(foodIndex, 2),
  };
}

function stepToward(current: number, target: number, rate: number, maxFrac: number, noise: number): number {
  const step = (target - current) * rate;
  const capped = clamp(step, -current * maxFrac, current * maxFrac);
  return Math.max(1, current + capped + current * noise);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
