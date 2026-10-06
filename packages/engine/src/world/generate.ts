// Deterministic world generation: same seed + same data always gives the same world.
import { STATES, PARTIES, NAME_POOLS, HONORIFICS, BLOCKED_SURNAMES, type StateData, type Zone } from '@avm/data';
import { Rng, clamp } from '../rng.js';
import {
  BLOC_KEYS,
  INSECURITY_TYPES,
  ISSUES,
  type BlocKey,
  type ConstituencyLga,
  type GenConstituency,
  type GenDistrict,
  type GenLga,
  type GenNpc,
  type GenSeat,
  type GenState,
  type GenWard,
  type NpcPersonality,
  type SeatKind,
  type GeneratedWorld,
  type InsecurityType,
  type Issue,
  type UnitProfile,
  type VoterBloc,
} from './types.js';

// ---------- baselines (game-flavour numbers, not real statistics) ----------

const ZONE_WEALTH: Record<Zone, number> = { NC: 42, NE: 36, NW: 38, SE: 50, SS: 52, SW: 52 };
const STATE_WEALTH_OVERRIDE: Record<string, number> = { LA: 82, FC: 78, RI: 66 };

const ZONE_INSECURITY: Record<Zone, Record<InsecurityType, number>> = {
  NW: { banditry: 62, kidnapping: 52, farmer_herder: 35, communal: 22, militancy: 5, urban_crime: 25 },
  NE: { banditry: 55, kidnapping: 40, farmer_herder: 35, communal: 25, militancy: 5, urban_crime: 20 },
  NC: { banditry: 35, kidnapping: 40, farmer_herder: 55, communal: 42, militancy: 5, urban_crime: 30 },
  SE: { banditry: 12, kidnapping: 42, farmer_herder: 22, communal: 25, militancy: 15, urban_crime: 35 },
  SS: { banditry: 10, kidnapping: 38, farmer_herder: 20, communal: 30, militancy: 50, urban_crime: 38 },
  SW: { banditry: 12, kidnapping: 30, farmer_herder: 25, communal: 20, militancy: 8, urban_crime: 45 },
};

interface BlocArchetype {
  ruralShare: number;
  urbanShare: number;
  partyLoyalty: number;
  moneySensitivity: number;
  charismaSensitivity: number;
  incumbencyBias: number;
  regionalAlignment: number;
  issues: Issue[];
}

const BLOC_ARCHETYPES: Record<BlocKey, BlocArchetype> = {
  youth: { ruralShare: 0.2, urbanShare: 0.28, partyLoyalty: 0.25, moneySensitivity: 0.5, charismaSensitivity: 0.8, incumbencyBias: -0.4, regionalAlignment: 0.3, issues: ['youth_employment', 'jobs', 'education', 'power'] },
  farmers: { ruralShare: 0.32, urbanShare: 0.04, partyLoyalty: 0.6, moneySensitivity: 0.6, charismaSensitivity: 0.4, incumbencyBias: 0.1, regionalAlignment: 0.6, issues: ['farmers', 'security', 'roads', 'fuel_price'] },
  traders: { ruralShare: 0.14, urbanShare: 0.22, partyLoyalty: 0.4, moneySensitivity: 0.5, charismaSensitivity: 0.5, incumbencyBias: 0, regionalAlignment: 0.5, issues: ['economy', 'fuel_price', 'roads', 'power'] },
  civil_servants: { ruralShare: 0.08, urbanShare: 0.14, partyLoyalty: 0.5, moneySensitivity: 0.3, charismaSensitivity: 0.4, incumbencyBias: 0.2, regionalAlignment: 0.4, issues: ['economy', 'corruption', 'health', 'education'] },
  artisans: { ruralShare: 0.1, urbanShare: 0.16, partyLoyalty: 0.45, moneySensitivity: 0.65, charismaSensitivity: 0.55, incumbencyBias: -0.1, regionalAlignment: 0.45, issues: ['power', 'jobs', 'fuel_price', 'economy'] },
  faith_community: { ruralShare: 0.13, urbanShare: 0.1, partyLoyalty: 0.55, moneySensitivity: 0.35, charismaSensitivity: 0.6, incumbencyBias: 0.1, regionalAlignment: 0.6, issues: ['security', 'health', 'education', 'corruption'] },
  elites: { ruralShare: 0.03, urbanShare: 0.06, partyLoyalty: 0.35, moneySensitivity: 0.2, charismaSensitivity: 0.3, incumbencyBias: 0.3, regionalAlignment: 0.3, issues: ['economy', 'power', 'security', 'corruption'] },
};

// ---------- helpers ----------

function normalise<K extends string>(rec: Record<K, number>): Record<K, number> {
  const keys = Object.keys(rec) as K[];
  const total = keys.reduce((s, k) => s + Math.max(0, rec[k]), 0);
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = total > 0 ? Math.max(0, rec[k]) / total : 1 / keys.length;
  return out;
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Split `items` into `groups` contiguous chunks whose sizes differ by at most one. */
export function contiguousPartition<T>(items: readonly T[], groups: number): T[][] {
  if (groups <= 0) throw new RangeError('groups must be positive');
  if (groups > items.length) throw new RangeError(`cannot split ${items.length} items into ${groups} groups`);
  const base = Math.floor(items.length / groups);
  let extra = items.length % groups;
  const out: T[][] = [];
  let i = 0;
  for (let g = 0; g < groups; g++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

function lgaId(stateCode: string, idx: number): string {
  return `${stateCode}-${String(idx + 1).padStart(3, '0')}`;
}

// ---------- LGA profile ----------

function genLgaProfile(rng: Rng, state: StateData, isCapital: boolean, population: number): UnitProfile {
  const baseWealth = STATE_WEALTH_OVERRIDE[state.code] ?? ZONE_WEALTH[state.zone];
  const wealth = Math.round(clamp(rng.gaussian(baseWealth + (isCapital ? 15 : 0), 9), 5, 98));
  const urbanity = clamp((wealth - 20) / 70 + (isCapital ? 0.25 : 0), 0, 1);

  const insecurity = {} as Record<InsecurityType, number>;
  for (const t of INSECURITY_TYPES) {
    const base = ZONE_INSECURITY[state.zone][t];
    const urbanAdj = t === 'urban_crime' ? urbanity * 15 : t === 'banditry' || t === 'farmer_herder' ? -urbanity * 15 : 0;
    insecurity[t] = Math.round(clamp(rng.gaussian(base + urbanAdj, 10), 0, 100));
  }

  const rawIssues = {} as Record<Issue, number>;
  for (const i of ISSUES) rawIssues[i] = rng.float(0.5, 1.5);
  const avgInsecurity = INSECURITY_TYPES.reduce((s, t) => s + insecurity[t], 0) / INSECURITY_TYPES.length;
  rawIssues.security += avgInsecurity / 25;
  rawIssues.farmers += (1 - urbanity) * 1.2;
  rawIssues.power += urbanity * 0.8;
  rawIssues.jobs += (100 - wealth) / 80;
  const issues = mapRound(normalise(rawIssues));

  const rawLean: Record<string, number> = {};
  for (const p of PARTIES) rawLean[p.code] = Math.max(1, p.zoneStrength[state.zone] + rng.gaussian(0, 12));
  const leanings = mapRound(normalise(rawLean));

  const rawShares = {} as Record<BlocKey, number>;
  for (const k of BLOC_KEYS) {
    const a = BLOC_ARCHETYPES[k];
    rawShares[k] = (a.ruralShare * (1 - urbanity) + a.urbanShare * urbanity) * rng.float(0.8, 1.2);
  }
  const shares = normalise(rawShares);
  const blocs: VoterBloc[] = BLOC_KEYS.map((k) => {
    const a = BLOC_ARCHETYPES[k];
    const j = () => rng.float(-0.08, 0.08);
    return {
      key: k,
      share: round(shares[k]),
      partyLoyalty: round(clamp(a.partyLoyalty + j(), 0, 1), 3),
      moneySensitivity: round(clamp(a.moneySensitivity + j() + (100 - wealth) / 500, 0, 1), 3),
      charismaSensitivity: round(clamp(a.charismaSensitivity + j(), 0, 1), 3),
      incumbencyBias: round(clamp(a.incumbencyBias + j(), -1, 1), 3),
      regionalAlignment: round(clamp(a.regionalAlignment + j(), 0, 1), 3),
      topIssues: [...a.issues],
    };
  });

  return { population, wealth, insecurity, issues, leanings, blocs };
}

function mapRound<K extends string>(rec: Record<K, number>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of Object.keys(rec) as K[]) out[k] = round(rec[k]);
  return out;
}

/** Population-weighted aggregate of several unit profiles (with optional share per part). */
export function aggregateProfiles(parts: { profile: UnitProfile; share: number }[]): UnitProfile {
  const weighted = parts.map((p) => ({ p: p.profile, w: p.profile.population * p.share }));
  const population = Math.round(weighted.reduce((s, x) => s + x.w, 0));
  const W = population || 1;
  const avg = (f: (p: UnitProfile) => number) => weighted.reduce((s, x) => s + f(x.p) * x.w, 0) / W;

  const insecurity = {} as Record<InsecurityType, number>;
  for (const t of INSECURITY_TYPES) insecurity[t] = Math.round(avg((p) => p.insecurity[t]));
  const issues = {} as Record<Issue, number>;
  for (const i of ISSUES) issues[i] = avg((p) => p.issues[i]);
  const partyCodes = Object.keys(parts[0]?.profile.leanings ?? {});
  const leanings: Record<string, number> = {};
  for (const c of partyCodes) leanings[c] = avg((p) => p.leanings[c] ?? 0);

  const blocs: VoterBloc[] = BLOC_KEYS.map((k) => {
    const get = (p: UnitProfile) => p.blocs.find((b) => b.key === k);
    const shareW = (f: (b: VoterBloc) => number) => {
      let num = 0;
      let den = 0;
      for (const x of weighted) {
        const b = get(x.p);
        if (!b) continue;
        num += f(b) * b.share * x.w;
        den += b.share * x.w;
      }
      return den ? num / den : 0;
    };
    const first = parts.map((p) => get(p.profile)).find(Boolean);
    return {
      key: k,
      share: round(avg((p) => get(p)?.share ?? 0)),
      partyLoyalty: round(shareW((b) => b.partyLoyalty), 3),
      moneySensitivity: round(shareW((b) => b.moneySensitivity), 3),
      charismaSensitivity: round(shareW((b) => b.charismaSensitivity), 3),
      incumbencyBias: round(shareW((b) => b.incumbencyBias), 3),
      regionalAlignment: round(shareW((b) => b.regionalAlignment), 3),
      topIssues: first ? [...first.topIssues] : [],
    };
  });

  return {
    population,
    wealth: Math.round(avg((p) => p.wealth)),
    insecurity,
    issues: mapRound(normalise(issues)),
    leanings: mapRound(normalise(leanings)),
    blocs,
  };
}

// ---------- constituencies ----------

/**
 * Build `count` federal constituencies from a state's LGAs.
 * If count <= LGAs: contiguous groups. If count > LGAs (e.g. Lagos): every LGA gets one,
 * and the most populous LGAs are split into "I" and "II" halves until the count is reached.
 */
export function buildConstituencies(stateCode: string, lgas: GenLga[], count: number): { id: string; name: string; lgas: ConstituencyLga[] }[] {
  const id = (i: number) => `${stateCode}-FC${String(i + 1).padStart(2, '0')}`;
  if (count <= lgas.length) {
    return contiguousPartition(lgas, count).map((group, i) => ({
      id: id(i),
      name: constituencyName(group.map((l) => l.name)),
      lgas: group.map((l) => ({ lgaId: l.id, share: 1 })),
    }));
  }
  const extra = count - lgas.length;
  if (extra > lgas.length) throw new RangeError(`${stateCode}: too many constituencies to split`);
  const splitIds = new Set(
    [...lgas]
      .sort((a, b) => b.population - a.population || a.id.localeCompare(b.id))
      .slice(0, extra)
      .map((l) => l.id),
  );
  const out: { id: string; name: string; lgas: ConstituencyLga[] }[] = [];
  for (const l of lgas) {
    if (splitIds.has(l.id)) {
      out.push({ id: id(out.length), name: `${l.name} I`, lgas: [{ lgaId: l.id, share: 0.5 }] });
      out.push({ id: id(out.length), name: `${l.name} II`, lgas: [{ lgaId: l.id, share: 0.5 }] });
    } else {
      out.push({ id: id(out.length), name: l.name, lgas: [{ lgaId: l.id, share: 1 }] });
    }
  }
  return out;
}

function constituencyName(names: string[]): string {
  if (names.length <= 3) return names.join('/');
  return `${names[0]}/${names[1]} & Environs`;
}

const DISTRICT_SUFFIX = ['North', 'Central', 'South'];

// ---------- NPCs ----------

function npcName(rng: Rng, zone: Zone, gender: 'male' | 'female', senior: boolean): string {
  const pool = NAME_POOLS[zone];
  for (;;) {
    const first = rng.pick(gender === 'male' ? pool.firstMale : pool.firstFemale);
    const last = rng.pick(pool.last);
    if (BLOCKED_SURNAMES.includes(last.toLowerCase())) continue;
    if (senior && rng.chance(0.45)) {
      const honorifics = HONORIFICS.filter((h) =>
        gender === 'male' ? h !== 'Hajiya' && h !== 'Mrs.' : h !== 'Alhaji' && h !== 'Mr.' && h !== 'Otunba' && h !== 'Prince',
      );
      return `${rng.pick(honorifics)} ${first} ${last}`;
    }
    return `${first} ${last}`;
  }
}

/** Pick a real party (never Independent), favouring the unit's strongest leanings. */
export function pickLeaningParty(rng: Rng, leanings: Record<string, number>): string {
  const codes = Object.keys(leanings).filter((c) => c !== 'IND');
  return rng.weighted(codes, (c) => (leanings[c] ?? 0) ** 2);
}

const LOCAL_KINDS: readonly SeatKind[] = ['LG_CHAIRMAN', 'COUNCILLOR', 'WARD_CHAIRMAN'];

/** Name, gender, age and personality for an NPC office holder. */
function npcPerson(r: Rng, zone: Zone, kind: SeatKind): { name: string; gender: 'male' | 'female'; age: number; personality: NpcPersonality } {
  const gender = r.chance(0.3) ? 'female' : 'male';
  const local = LOCAL_KINDS.includes(kind);
  const name = npcName(r, zone, gender, !local);
  const age = kind === 'LG_CHAIRMAN' ? r.int(32, 62) : local ? r.int(28, 65) : r.int(40, 74);
  const personality = { integrity: r.int(10, 90), greed: r.int(10, 90), loyalty: r.int(20, 95), ambition: r.int(20, 95) };
  return { name, gender, age, personality };
}

/**
 * A fresh NPC for a seat after the world was generated (appointed deputy, replacement for a term-limited NPC).
 * `serial` makes the id unique per seat.
 */
export function generateNpc(rng: Rng, opts: { seatId: string; kind: SeatKind; stateCode: string; zone: Zone; partyCode: string; serial: number }): GenNpc {
  return { id: `npc-${opts.seatId}-${opts.serial}`, stateCode: opts.stateCode, partyCode: opts.partyCode, seatId: opts.seatId, ...npcPerson(rng, opts.zone, opts.kind) };
}

// ---------- main ----------

export function generateWorld(seed: string, states: readonly StateData[] = STATES): GeneratedWorld {
  const root = new Rng(seed);
  const genStates: GenState[] = [];
  const lgas: GenLga[] = [];
  const districts: GenDistrict[] = [];
  const constituencies: GenConstituency[] = [];

  for (const st of states) {
    const rng = root.fork(`state:${st.code}`);
    // Population split across LGAs with lognormal-ish weights; capital gets a boost.
    const capitalIdx = st.lgas.findIndex((n) => n.toLowerCase().includes(st.capital.toLowerCase().split(' ')[0] ?? ''));
    const weights = st.lgas.map((_, i) => Math.exp(rng.gaussian(0, 0.35)) * (i === capitalIdx ? 1.8 : 1));
    const wTotal = weights.reduce((a, b) => a + b, 0);
    const stateLgas: GenLga[] = st.lgas.map((name, i) => {
      const population = Math.round((st.populationK * 1000 * (weights[i] ?? 1)) / wTotal);
      const lrng = rng.fork(`lga:${i}`);
      return { id: lgaId(st.code, i), stateCode: st.code, name, isCapital: i === capitalIdx, ...genLgaProfile(lrng, st, i === capitalIdx, population) };
    });
    lgas.push(...stateLgas);

    const stateProfile = aggregateProfiles(stateLgas.map((l) => ({ profile: l, share: 1 })));
    genStates.push({ code: st.code, name: st.name, capital: st.capital, zone: st.zone, isFct: !!st.isFct, ...stateProfile });

    const districtGroups = st.isFct ? [stateLgas] : contiguousPartition(stateLgas, 3);
    districtGroups.forEach((group, i) => {
      districts.push({
        id: `${st.code}-SD${i + 1}`,
        stateCode: st.code,
        name: st.isFct ? 'FCT' : `${st.name} ${DISTRICT_SUFFIX[i]}`,
        lgaIds: group.map((l) => l.id),
        ...aggregateProfiles(group.map((l) => ({ profile: l, share: 1 }))),
      });
    });

    const byId = new Map(stateLgas.map((l) => [l.id, l]));
    for (const c of buildConstituencies(st.code, stateLgas, st.repsSeats)) {
      constituencies.push({
        ...c,
        stateCode: st.code,
        ...aggregateProfiles(c.lgas.map((cl) => ({ profile: byId.get(cl.lgaId) as GenLga, share: cl.share }))),
      });
    }
  }

  const wards = buildWards(root.fork('wards'), lgas);
  const seats = buildSeats(genStates, districts, constituencies, lgas, wards);
  const npcs = buildNpcs(root.fork('npcs'), seats, genStates, districts, constituencies, lgas);
  return { seed, states: genStates, lgas, districts, constituencies, wards, seats, npcs };
}

/** Wards per LGA (game numbers: 8-14, about 11 on average, near the real national average). */
function buildWards(rng: Rng, lgas: GenLga[]): GenWard[] {
  const wards: GenWard[] = [];
  for (const l of lgas) {
    const n = rng.fork(l.id).int(8, 14);
    for (let i = 1; i <= n; i++) {
      wards.push({ id: `${l.id}-W${String(i).padStart(2, '0')}`, lgaId: l.id, stateCode: l.stateCode, number: i, name: `${l.name} Ward ${i}` });
    }
  }
  return wards;
}

function buildSeats(states: GenState[], districts: GenDistrict[], constituencies: GenConstituency[], lgas: GenLga[], wards: GenWard[]): GenSeat[] {
  const none = { stateCode: null, districtId: null, constituencyId: null, lgaId: null, wardId: null };
  const seats: GenSeat[] = [
    { id: 'PRES', kind: 'PRESIDENT', name: 'President of the Federal Republic', ...none },
    { id: 'VP', kind: 'VICE_PRESIDENT', name: 'Vice President', ...none },
  ];
  for (const s of states) {
    if (s.isFct) continue;
    seats.push({ id: `GOV-${s.code}`, kind: 'GOVERNOR', name: `Governor of ${s.name} State`, ...none, stateCode: s.code });
    seats.push({ id: `DGOV-${s.code}`, kind: 'DEPUTY_GOVERNOR', name: `Deputy Governor of ${s.name} State`, ...none, stateCode: s.code });
  }
  for (const d of districts) {
    seats.push({ id: `SEN-${d.id}`, kind: 'SENATOR', name: `Senator, ${d.name}`, ...none, stateCode: d.stateCode, districtId: d.id });
  }
  for (const c of constituencies) {
    seats.push({ id: `REP-${c.id}`, kind: 'REP', name: `Member, House of Reps (${c.name})`, ...none, stateCode: c.stateCode, constituencyId: c.id });
  }
  for (const l of lgas) {
    seats.push({ id: `LGC-${l.id}`, kind: 'LG_CHAIRMAN', name: `Chairman, ${l.name} LGA`, ...none, stateCode: l.stateCode, lgaId: l.id });
  }
  for (const w of wards) {
    const at = { ...none, stateCode: w.stateCode, lgaId: w.lgaId, wardId: w.id };
    seats.push({ id: `CLR-${w.id}`, kind: 'COUNCILLOR', name: `Councillor, ${w.name}`, ...at });
    seats.push({ id: `WCH-${w.id}`, kind: 'WARD_CHAIRMAN', name: `Ward Chairman, ${w.name}`, ...at });
  }
  return seats;
}

function buildNpcs(
  rng: Rng,
  seats: GenSeat[],
  states: GenState[],
  districts: GenDistrict[],
  constituencies: GenConstituency[],
  lgas: GenLga[],
): GenNpc[] {
  const stateBy = new Map(states.map((s) => [s.code, s]));
  const districtBy = new Map(districts.map((d) => [d.id, d]));
  const constBy = new Map(constituencies.map((c) => [c.id, c]));
  const lgaBy = new Map(lgas.map((l) => [l.id, l]));
  const npcs: GenNpc[] = [];
  const partyOfSeat = new Map<string, string>();

  // National leanings for president.
  const national = aggregateProfiles(states.map((s) => ({ profile: s, share: 1 })));
  const zones: Zone[] = ['NC', 'NE', 'NW', 'SE', 'SS', 'SW'];

  for (const seat of seats) {
    const r = rng.fork(seat.id);
    let leanings: Record<string, number>;
    let stateCode: string;
    if (seat.kind === 'PRESIDENT' || seat.kind === 'VICE_PRESIDENT') {
      leanings = national.leanings;
      stateCode = r.pick(states.filter((s) => !s.isFct)).code;
    } else {
      stateCode = seat.stateCode as string;
      const unit =
        (seat.lgaId && lgaBy.get(seat.lgaId)) ||
        (seat.constituencyId && constBy.get(seat.constituencyId)) ||
        (seat.districtId && districtBy.get(seat.districtId)) ||
        stateBy.get(stateCode);
      leanings = (unit as UnitProfile).leanings;
    }

    // Running mates share the principal's party; VP comes from a different zone than the president.
    let partyCode: string;
    if (seat.kind === 'VICE_PRESIDENT') partyCode = partyOfSeat.get('PRES') as string;
    else if (seat.kind === 'DEPUTY_GOVERNOR') partyCode = partyOfSeat.get(`GOV-${stateCode}`) as string;
    else partyCode = pickLeaningParty(r, leanings);
    partyOfSeat.set(seat.id, partyCode);

    if (seat.kind === 'VICE_PRESIDENT') {
      const presZone = stateBy.get(npcs[0]?.stateCode ?? '')?.zone;
      const otherZone = r.pick(zones.filter((z) => z !== presZone));
      stateCode = r.pick(states.filter((s) => s.zone === otherZone && !s.isFct)).code;
    }

    const zone = (stateBy.get(stateCode) as GenState).zone;
    npcs.push({ id: `npc-${seat.id}`, stateCode, partyCode, seatId: seat.id, ...npcPerson(r, zone, seat.kind) });
  }
  return npcs;
}
