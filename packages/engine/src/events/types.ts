import type { StatKey, Stats } from '../stats.js';

export const CAREER_LEVELS = ['citizen', 'lg_chairman', 'rep', 'senator', 'deputy_governor', 'governor', 'vice_president', 'president'] as const;
export type CareerLevel = (typeof CAREER_LEVELS)[number];

export const EVENT_CATEGORIES = [
  'campaign',
  'primaries',
  'media',
  'scandal',
  'governance',
  'legislative',
  'family',
  'godfather',
  'insecurity',
  'international',
  'humour',
  'rare',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type CompareOp = 'gte' | 'lte' | 'gt' | 'lt' | 'eq';

export type Condition =
  | { stat: StatKey; op: CompareOp; value: number }
  | { metric: string; op: CompareOp; value: number }
  | { money: 'wallet' | 'warChest'; op: CompareOp; value: number }
  | { approval: CompareOp; value: number }
  | { career: CareerLevel[] }
  | { phase: string[] }
  | { flag: string; present: boolean };

export type Effect =
  | { type: 'stat'; key: StatKey; delta: number }
  | { type: 'money'; account: 'wallet' | 'warChest'; delta: number }
  | { type: 'approval'; delta: number }
  | { type: 'metric'; key: string; delta: number }
  | { type: 'flag'; key: string; set: boolean };

export interface FollowUp {
  eventId: string;
  /** Turns (in-game months) until it fires. 0 = next selection. */
  delay: number;
}

export interface Outcome {
  /** Base weight (> 0). */
  weight: number;
  /** Optional: add stat value × factor to the weight (e.g. charisma helps). */
  statWeight?: { stat: StatKey; factor: number };
  text: string;
  effects: Effect[];
  followUps?: FollowUp[];
}

export interface Choice {
  id: string;
  label: string;
  /** Choice only offered when all conditions hold. */
  requires?: Condition[];
  /** One outcome is drawn by weight. */
  outcomes: Outcome[];
}

export interface EventDef {
  id: string;
  category: EventCategory;
  title: string;
  /** Template text (see text.ts). */
  text: string;
  weight: number;
  /** Turns before this event may fire again. */
  cooldown: number;
  /** Fires at most once per character. */
  once?: boolean;
  /** Only reachable as a follow-up, never picked at random. */
  followUpOnly?: boolean;
  conditions: Condition[];
  choices: Choice[];
}

export interface EventContext {
  turn: number;
  stats: Stats;
  money: { wallet: number; warChest: number };
  approval: number;
  career: CareerLevel;
  phase: string;
  flags: string[];
  metrics: Record<string, number>;
  /** eventId → last turn it fired. */
  history: Record<string, number>;
  /** Pending follow-ups. */
  scheduled: { eventId: string; turn: number }[];
}
