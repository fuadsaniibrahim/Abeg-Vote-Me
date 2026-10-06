// Approval rating: driven by events and performance, decaying toward a baseline.
import { clamp } from './rng.js';

export interface ApprovalDrivers {
  /** Change in economy metric since last tick (points). */
  economyDelta?: number;
  /** Change in security metric since last tick (points). */
  securityDelta?: number;
  /** Promises broken this tick. */
  brokenPromises?: number;
  /** Promises kept this tick. */
  keptPromises?: number;
  /** Severity (0-100) of scandals exposed this tick, summed. */
  scandalSeverity?: number;
  /** Active viral gaffes. */
  activeGaffes?: number;
  /** Direct one-off modifiers from events/press (points). */
  eventDelta?: number;
}

export const APPROVAL_WEIGHTS = {
  economy: 0.4,
  security: 0.5,
  brokenPromise: -4,
  keptPromise: 2,
  scandalPerPoint: -0.15,
  gaffe: -1.5,
  /** Fraction of the gap to baseline closed per tick. */
  decay: 0.08,
};

export function approvalChange(d: ApprovalDrivers): number {
  const w = APPROVAL_WEIGHTS;
  return (
    (d.economyDelta ?? 0) * w.economy +
    (d.securityDelta ?? 0) * w.security +
    (d.brokenPromises ?? 0) * w.brokenPromise +
    (d.keptPromises ?? 0) * w.keptPromise +
    (d.scandalSeverity ?? 0) * w.scandalPerPoint +
    (d.activeGaffes ?? 0) * w.gaffe +
    (d.eventDelta ?? 0)
  );
}

/** One tick: apply drivers, then decay part of the way back toward baseline. Result clamped to 0-100. */
export function tickApproval(current: number, drivers: ApprovalDrivers, baseline = 50): number {
  const moved = current + approvalChange(drivers);
  const decayed = moved - (moved - baseline) * APPROVAL_WEIGHTS.decay;
  return Math.round(clamp(decayed, 0, 100) * 10) / 10;
}
