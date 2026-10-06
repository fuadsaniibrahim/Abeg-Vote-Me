import { describe, expect, it } from 'vitest';
import { STATES, PARTIES, NAME_POOLS, BLOCKED_SURNAMES } from '../src/index.js';

// Official counts per state (INEC / constitution schedule).
const OFFICIAL_LGA_COUNTS: Record<string, number> = {
  AB: 17, AD: 21, AK: 31, AN: 21, BA: 20, BY: 8, BE: 23, BO: 27, CR: 18, DE: 25, EB: 13, ED: 18,
  EK: 16, EN: 17, GO: 11, IM: 27, JI: 27, KD: 23, KN: 44, KT: 34, KE: 21, KO: 21, KW: 16, LA: 20,
  NA: 13, NI: 25, OG: 20, ON: 18, OS: 30, OY: 33, PL: 17, RI: 23, SO: 23, TA: 16, YO: 17, ZA: 14, FC: 6,
};

describe('states', () => {
  it('has 36 states plus FCT', () => {
    expect(STATES).toHaveLength(37);
    expect(STATES.filter((s) => s.isFct)).toHaveLength(1);
    expect(new Set(STATES.map((s) => s.code)).size).toBe(37);
  });

  it('has 774 LGAs with per-state counts matching official totals', () => {
    const total = STATES.reduce((n, s) => n + s.lgas.length, 0);
    expect(total).toBe(774);
    for (const s of STATES) expect([s.code, s.lgas.length]).toEqual([s.code, OFFICIAL_LGA_COUNTS[s.code]]);
  });

  it('has no duplicate LGA names within a state', () => {
    for (const s of STATES) expect(new Set(s.lgas).size, s.name).toBe(s.lgas.length);
  });

  it('has federal constituency counts summing to 360', () => {
    expect(STATES.reduce((n, s) => n + s.repsSeats, 0)).toBe(360);
  });

  it('assigns every state to one of six zones', () => {
    for (const s of STATES) expect(['NC', 'NE', 'NW', 'SE', 'SS', 'SW']).toContain(s.zone);
  });
});

describe('parties', () => {
  it('includes the fictional core parties and an independent option', () => {
    const codes = PARTIES.map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['PUP', 'NDA', 'PRM', 'LF', 'IND']));
    expect(PARTIES.filter((p) => p.isIndependent)).toHaveLength(1);
  });

  it('gives every party a valid hex colour and unique code', () => {
    expect(new Set(PARTIES.map((p) => p.code)).size).toBe(PARTIES.length);
    for (const p of PARTIES) expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('name pools', () => {
  it('contain no blocked real-politician surnames', () => {
    for (const pool of Object.values(NAME_POOLS)) {
      for (const last of pool.last) {
        const l = last.toLowerCase();
        expect(BLOCKED_SURNAMES.some((b) => l === b || l.includes(b)), last).toBe(false);
      }
    }
  });
});
