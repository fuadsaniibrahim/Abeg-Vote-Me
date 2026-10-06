import { describe, expect, it } from 'vitest';
import { STATES, BLOCKED_SURNAMES } from '@avm/data';
import { generateWorld, buildConstituencies, contiguousPartition } from '../src/world/generate.js';
import { BLOC_KEYS, INSECURITY_TYPES, ISSUES, type UnitProfile } from '../src/world/types.js';

const world = generateWorld('test-seed');

function expectValidProfile(u: UnitProfile, label: string) {
  expect(u.population, label).toBeGreaterThan(0);
  expect(u.wealth, label).toBeGreaterThanOrEqual(0);
  expect(u.wealth, label).toBeLessThanOrEqual(100);
  for (const t of INSECURITY_TYPES) {
    expect(u.insecurity[t], `${label} ${t}`).toBeGreaterThanOrEqual(0);
    expect(u.insecurity[t], `${label} ${t}`).toBeLessThanOrEqual(100);
  }
  const issueSum = ISSUES.reduce((s, i) => s + u.issues[i], 0);
  expect(issueSum, label).toBeCloseTo(1, 2);
  const leanSum = Object.values(u.leanings).reduce((s, v) => s + v, 0);
  expect(leanSum, label).toBeCloseTo(1, 2);
  expect(u.blocs.map((b) => b.key), label).toEqual([...BLOC_KEYS]);
  expect(u.blocs.reduce((s, b) => s + b.share, 0), label).toBeCloseTo(1, 2);
}

describe('generateWorld', () => {
  it('is deterministic for the same seed', () => {
    expect(generateWorld('test-seed')).toEqual(world);
  });

  it('differs for a different seed', () => {
    const other = generateWorld('other-seed');
    expect(other.lgas[0]?.population).not.toBe(world.lgas[0]?.population);
  });

  it('creates 37 states and 774 LGAs with unique ids', () => {
    expect(world.states).toHaveLength(37);
    expect(world.lgas).toHaveLength(774);
    expect(new Set(world.lgas.map((l) => l.id)).size).toBe(774);
  });

  it('creates 109 senatorial districts: 3 per state and 1 for FCT', () => {
    expect(world.districts).toHaveLength(109);
    for (const s of STATES) {
      expect(world.districts.filter((d) => d.stateCode === s.code)).toHaveLength(s.isFct ? 1 : 3);
    }
    // every LGA is in exactly one district
    const covered = world.districts.flatMap((d) => d.lgaIds);
    expect(covered).toHaveLength(774);
    expect(new Set(covered).size).toBe(774);
  });

  it('creates 360 federal constituencies covering every LGA with full population share', () => {
    expect(world.constituencies).toHaveLength(360);
    const shareByLga = new Map<string, number>();
    for (const c of world.constituencies) for (const l of c.lgas) shareByLga.set(l.lgaId, (shareByLga.get(l.lgaId) ?? 0) + l.share);
    expect(shareByLga.size).toBe(774);
    for (const [id, share] of shareByLga) expect(share, id).toBeCloseTo(1, 6);
    for (const s of STATES) expect(world.constituencies.filter((c) => c.stateCode === s.code)).toHaveLength(s.repsSeats);
  });

  it('gives every state, LGA, district and constituency a valid unit profile', () => {
    for (const u of world.states) expectValidProfile(u, u.code);
    for (const u of world.lgas) expectValidProfile(u, u.id);
    for (const u of world.districts) expectValidProfile(u, u.id);
    for (const u of world.constituencies) expectValidProfile(u, u.id);
  });

  it('state population equals the sum of its LGAs', () => {
    for (const s of world.states) {
      const sum = world.lgas.filter((l) => l.stateCode === s.code).reduce((n, l) => n + l.population, 0);
      expect(Math.abs(s.population - sum), s.code).toBeLessThanOrEqual(1);
    }
  });

  it('creates the full seat list with correct counts', () => {
    const count = (k: string) => world.seats.filter((s) => s.kind === k).length;
    expect(count('PRESIDENT')).toBe(1);
    expect(count('VICE_PRESIDENT')).toBe(1);
    expect(count('GOVERNOR')).toBe(36);
    expect(count('DEPUTY_GOVERNOR')).toBe(36);
    expect(count('SENATOR')).toBe(109);
    expect(count('REP')).toBe(360);
    expect(count('LG_CHAIRMAN')).toBe(774);
    expect(count('COUNCILLOR')).toBe(world.wards.length);
    expect(count('WARD_CHAIRMAN')).toBe(world.wards.length);
    expect(world.seats).toHaveLength(1317 + 2 * world.wards.length);
    expect(new Set(world.seats.map((s) => s.id)).size).toBe(world.seats.length);
    expect(world.seats.find((s) => s.id === 'GOV-FC')).toBeUndefined();
  });

  it('generates 8-14 wards per LGA, each with a councillor and a ward chairman seat', () => {
    const perLga = new Map<string, number>();
    for (const w of world.wards) perLga.set(w.lgaId, (perLga.get(w.lgaId) ?? 0) + 1);
    expect(perLga.size).toBe(774);
    for (const [id, n] of perLga) {
      expect(n, id).toBeGreaterThanOrEqual(8);
      expect(n, id).toBeLessThanOrEqual(14);
    }
    expect(new Set(world.wards.map((w) => w.id)).size).toBe(world.wards.length);
    const w = world.wards.find((x) => x.id === 'LA-011-W01')!;
    expect(w.name).toBe(`${world.lgas.find((l) => l.id === 'LA-011')!.name} Ward 1`);
    const seats = world.seats.filter((s) => s.wardId === w.id);
    expect(seats.map((s) => s.kind).sort()).toEqual(['COUNCILLOR', 'WARD_CHAIRMAN']);
    for (const s of seats) expect(s).toMatchObject({ stateCode: 'LA', lgaId: 'LA-011' });
  });

  it('creates exactly one NPC placeholder per seat', () => {
    expect(world.npcs).toHaveLength(world.seats.length);
    expect(new Set(world.npcs.map((n) => n.seatId)).size).toBe(world.seats.length);
  });

  it('NPC names never use blocked real-politician surnames', () => {
    for (const n of world.npcs) {
      const parts = n.name.toLowerCase().split(' ');
      expect(parts.some((p) => BLOCKED_SURNAMES.includes(p)), n.name).toBe(false);
    }
  });

  it('running mates share their principal party; VP is from another zone', () => {
    const npc = (seat: string) => world.npcs.find((n) => n.seatId === seat)!;
    expect(npc('VP').partyCode).toBe(npc('PRES').partyCode);
    const zone = (code: string) => STATES.find((s) => s.code === code)!.zone;
    expect(zone(npc('VP').stateCode)).not.toBe(zone(npc('PRES').stateCode));
    for (const s of STATES.filter((x) => !x.isFct)) expect(npc(`DGOV-${s.code}`).partyCode).toBe(npc(`GOV-${s.code}`).partyCode);
  });

  it('NPC holders are never independents and have personalities in range', () => {
    for (const n of world.npcs) {
      expect(n.partyCode).not.toBe('IND');
      for (const v of Object.values(n.personality)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('buildConstituencies', () => {
  it('splits the most populous LGAs into I and II when constituencies exceed LGAs (Lagos)', () => {
    const lagos = world.lgas.filter((l) => l.stateCode === 'LA');
    const cs = buildConstituencies('LA', lagos, 24);
    expect(cs).toHaveLength(24);
    expect(cs.filter((c) => c.name.endsWith(' I'))).toHaveLength(4);
    expect(cs.filter((c) => c.name.endsWith(' II'))).toHaveLength(4);
  });

  it('groups LGAs contiguously when constituencies are fewer than LGAs', () => {
    const kano = world.lgas.filter((l) => l.stateCode === 'KN');
    const cs = buildConstituencies('KN', kano, 24);
    expect(cs).toHaveLength(24);
    expect(cs.flatMap((c) => c.lgas.map((l) => l.lgaId))).toEqual(kano.map((l) => l.id));
  });
});

describe('contiguousPartition', () => {
  it('splits into near-equal contiguous groups', () => {
    expect(contiguousPartition([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5], [6, 7]]);
  });

  it('rejects more groups than items', () => {
    expect(() => contiguousPartition([1, 2], 3)).toThrow();
  });
});
