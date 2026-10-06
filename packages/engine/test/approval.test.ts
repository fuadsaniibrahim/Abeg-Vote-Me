import { describe, expect, it } from 'vitest';
import { approvalChange, tickApproval } from '../src/approval.js';

describe('approval', () => {
  it('rises with better economy/security and kept promises, falls with broken promises, scandals and gaffes', () => {
    expect(approvalChange({ economyDelta: 5, securityDelta: 5, keptPromises: 1 })).toBeGreaterThan(0);
    expect(approvalChange({ brokenPromises: 1 })).toBeLessThan(0);
    expect(approvalChange({ scandalSeverity: 60 })).toBeLessThan(0);
    expect(approvalChange({ activeGaffes: 2 })).toBeLessThan(0);
  });

  it('a broken promise costs more than a kept one earns', () => {
    expect(Math.abs(approvalChange({ brokenPromises: 1 }))).toBeGreaterThan(approvalChange({ keptPromises: 1 }));
  });

  it('decays toward the baseline when nothing happens', () => {
    let a = 90;
    for (let i = 0; i < 60; i++) a = tickApproval(a, {});
    expect(a).toBeGreaterThan(49);
    expect(a).toBeLessThan(51);
    let b = 10;
    for (let i = 0; i < 60; i++) b = tickApproval(b, {});
    expect(b).toBeGreaterThan(49);
  });

  it('is clamped to 0-100', () => {
    expect(tickApproval(95, { eventDelta: 50 })).toBeLessThanOrEqual(100);
    expect(tickApproval(5, { eventDelta: -50, brokenPromises: 5 })).toBeGreaterThanOrEqual(0);
  });
});
