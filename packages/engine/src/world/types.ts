import type { Zone } from '@avm/data';

export const ISSUES = [
  'security',
  'economy',
  'jobs',
  'education',
  'power',
  'roads',
  'health',
  'corruption',
  'fuel_price',
  'youth_employment',
  'farmers',
] as const;
export type Issue = (typeof ISSUES)[number];

export const INSECURITY_TYPES = ['banditry', 'kidnapping', 'farmer_herder', 'communal', 'militancy', 'urban_crime'] as const;
export type InsecurityType = (typeof INSECURITY_TYPES)[number];

export const BLOC_KEYS = ['youth', 'farmers', 'traders', 'civil_servants', 'artisans', 'faith_community', 'elites'] as const;
export type BlocKey = (typeof BLOC_KEYS)[number];

export interface VoterBloc {
  key: BlocKey;
  /** Share of the unit's voters, 0-1. Shares in a unit sum to 1. */
  share: number;
  /** 0-1: how strongly the bloc sticks with its preferred party. */
  partyLoyalty: number;
  /** 0-1: how much "logistics" (money) sways it. */
  moneySensitivity: number;
  /** 0-1: how much candidate charisma sways it. */
  charismaSensitivity: number;
  /** -1..1: preference for incumbents (negative = anti-incumbent). */
  incumbencyBias: number;
  /** 0-1: weight on regional alignment of the candidate. */
  regionalAlignment: number;
  /** Top issues this bloc cares about, most important first. */
  topIssues: Issue[];
}

/** Attributes every unit (state, LGA, district, constituency) carries. */
export interface UnitProfile {
  population: number;
  /** 0-100 */
  wealth: number;
  /** 0-100 per type */
  insecurity: Record<InsecurityType, number>;
  /** Weights summing to 1. */
  issues: Record<Issue, number>;
  /** Party code -> share summing to 1. */
  leanings: Record<string, number>;
  blocs: VoterBloc[];
}

export interface GenState extends UnitProfile {
  code: string;
  name: string;
  capital: string;
  zone: Zone;
  isFct: boolean;
}

export interface GenLga extends UnitProfile {
  id: string;
  stateCode: string;
  name: string;
  isCapital: boolean;
}

export interface GenDistrict extends UnitProfile {
  id: string;
  stateCode: string;
  name: string;
  lgaIds: string[];
}

export interface ConstituencyLga {
  lgaId: string;
  /** Fraction of the LGA's population in this constituency (1 unless the LGA is split). */
  share: number;
}

export interface GenConstituency extends UnitProfile {
  id: string;
  stateCode: string;
  name: string;
  lgas: ConstituencyLga[];
}

export interface GenWard {
  id: string;
  lgaId: string;
  stateCode: string;
  /** 1-based within the LGA. */
  number: number;
  name: string;
}

export const SEAT_KINDS = ['PRESIDENT', 'VICE_PRESIDENT', 'GOVERNOR', 'DEPUTY_GOVERNOR', 'SENATOR', 'REP', 'LG_CHAIRMAN', 'COUNCILLOR', 'WARD_CHAIRMAN'] as const;
export type SeatKind = (typeof SEAT_KINDS)[number];

export interface GenSeat {
  id: string;
  kind: SeatKind;
  name: string;
  stateCode: string | null;
  districtId: string | null;
  constituencyId: string | null;
  lgaId: string | null;
  wardId: string | null;
}

export interface NpcPersonality {
  integrity: number;
  greed: number;
  loyalty: number;
  ambition: number;
}

export interface GenNpc {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  stateCode: string;
  partyCode: string;
  personality: NpcPersonality;
  /** Seat this NPC holds as placeholder. */
  seatId: string;
}

export interface GeneratedWorld {
  seed: string;
  states: GenState[];
  lgas: GenLga[];
  districts: GenDistrict[];
  constituencies: GenConstituency[];
  wards: GenWard[];
  seats: GenSeat[];
  npcs: GenNpc[];
}
