// Backgrounds, traits and character creation validation.
import { BLOCKED_SURNAMES, STATES, type StateData } from '@avm/data';
import { applyStatMods, type StatMods, type Stats } from './stats.js';

export const BACKGROUND_IDS = [
  'businessperson',
  'lawyer',
  'lecturer',
  'civil_servant',
  'activist',
  'military',
  'entertainer',
  'trader',
  'community_leader',
  'journalist',
] as const;
export type BackgroundId = (typeof BACKGROUND_IDS)[number];

export interface Background {
  id: BackgroundId;
  label: string;
  blurb: string;
  stats: Stats;
  /** Starting personal wallet in naira. */
  startingWallet: number;
  perks: { id: string; label: string }[];
}

const bg = (
  id: BackgroundId,
  label: string,
  blurb: string,
  s: [number, number, number, number, number, number, number, number],
  startingWallet: number,
  perks: [string, string][],
): Background => ({
  id,
  label,
  blurb,
  // order: charisma, wealth, connections, integrity, publicImage, intelligence, stamina, mediaSkill
  stats: { charisma: s[0], wealth: s[1], connections: s[2], integrity: s[3], publicImage: s[4], intelligence: s[5], stamina: s[6], mediaSkill: s[7] },
  startingWallet,
  perks: perks.map(([pid, plabel]) => ({ id: pid, label: plabel })),
});

export const BACKGROUNDS: Record<BackgroundId, Background> = {
  businessperson: bg('businessperson', 'Local Businessperson', 'You sabi make money. Now make votes.', [50, 70, 55, 45, 45, 50, 50, 35], 5_000_000, [['business_discount', 'Businesses cost 20% less to start']]),
  lawyer: bg('lawyer', 'Lawyer', 'Learned colleague, your tongue na your weapon.', [55, 50, 50, 55, 45, 65, 45, 45], 2_500_000, [['legal_eagle', 'Cheaper tribunals and court cases']]),
  lecturer: bg('lecturer', 'University Lecturer', 'From ASUU strike to campaign trail.', [45, 30, 40, 70, 50, 75, 45, 40], 800_000, [['policy_wonk', 'Bonus in debates on policy topics']]),
  civil_servant: bg('civil_servant', 'Civil Servant', 'You know where every file dey hide.', [45, 40, 60, 50, 45, 60, 50, 35], 1_200_000, [['insider', 'Faster appointments and contract processing']]),
  activist: bg('activist', 'Activist / Youth Leader', 'Comrade! The streets know your name.', [65, 20, 40, 70, 55, 50, 60, 55], 300_000, [['mobiliser', 'Protests and rallies draw bigger crowds']]),
  military: bg('military', 'Retired Military Officer', 'Discipline, order, and a few old friends in uniform.', [45, 55, 60, 50, 50, 50, 60, 30], 3_000_000, [['security_expert', 'Bonus to security policy outcomes']]),
  entertainer: bg('entertainer', 'Entertainer / Influencer', 'Your fans go vote... if them wake up early.', [65, 50, 40, 45, 65, 35, 50, 70], 2_000_000, [['star_power', 'Rallies and social posts reach more people']]),
  trader: bg('trader', 'Trader / Market Leader', 'Market women and men dey your back.', [55, 45, 55, 50, 50, 40, 60, 35], 1_500_000, [['market_network', 'Bonus with traders voter bloc']]),
  community_leader: bg('community_leader', 'Religious / Community Leader', 'Your congregation listens every week.', [65, 40, 55, 65, 60, 45, 45, 40], 1_000_000, [['trusted_voice', 'Bonus with faith community voter bloc']]),
  journalist: bg('journalist', 'Journalist', 'You don expose others. Now na your turn for spotlight.', [50, 30, 45, 60, 50, 60, 45, 70], 600_000, [['newsroom_friends', 'Better press conference outcomes']]),
};

export const TRAIT_IDS = [
  'silver_tongue',
  'grassroots_hero',
  'deep_pockets',
  'clean_hands',
  'godfathers_child',
  'social_media_star',
  'workhorse',
  'bookworm',
  'party_loyalist',
  'firebrand',
  'smooth_operator',
  'street_smart',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

export interface Trait {
  id: TraitId;
  label: string;
  blurb: string;
  mods: StatMods;
  /** Extra starting wallet in naira. */
  walletBonus?: number;
}

export const TRAITS: Record<TraitId, Trait> = {
  silver_tongue: { id: 'silver_tongue', label: 'Silver Tongue', blurb: 'Your mouth fit sell sand for Sahara.', mods: { charisma: 10, mediaSkill: 5 } },
  grassroots_hero: { id: 'grassroots_hero', label: 'Grassroots Hero', blurb: 'Mama Put and okada riders know you by name.', mods: { publicImage: 10, stamina: 5 } },
  deep_pockets: { id: 'deep_pockets', label: 'Deep Pockets', blurb: 'Family money. Plenty of it.', mods: { wealth: 15 }, walletBonus: 3_000_000 },
  clean_hands: { id: 'clean_hands', label: 'Clean Hands', blurb: 'Never collected a kobo wey no be your own.', mods: { integrity: 15, connections: -5 } },
  godfathers_child: { id: 'godfathers_child', label: "Godfather's Boy/Girl", blurb: 'Oga at the top dey watch your back... for a price.', mods: { connections: 15, integrity: -5 } },
  social_media_star: { id: 'social_media_star', label: 'Social Media Star', blurb: 'Your tweets get more engagement than the President.', mods: { mediaSkill: 15, publicImage: 5 } },
  workhorse: { id: 'workhorse', label: 'Workhorse', blurb: 'Three rallies a day, no wahala.', mods: { stamina: 15 } },
  bookworm: { id: 'bookworm', label: 'Bookworm', blurb: 'You read the whole budget. Every page.', mods: { intelligence: 15, charisma: -5 } },
  party_loyalist: { id: 'party_loyalist', label: 'Party Loyalist', blurb: 'Party supremacy is your middle name.', mods: { connections: 10, publicImage: -3 } },
  firebrand: { id: 'firebrand', label: 'Firebrand', blurb: 'You talk, crowd shout. Elders frown.', mods: { charisma: 10, connections: -5 } },
  smooth_operator: { id: 'smooth_operator', label: 'Smooth Operator', blurb: 'Deals happen around you like magic.', mods: { connections: 10, integrity: -10 } },
  street_smart: { id: 'street_smart', label: 'Street Smart', blurb: 'Nobody fit 419 you.', mods: { intelligence: 8, stamina: 5 } },
};

/** Pairs that cannot be picked together. */
export const INCOMPATIBLE_TRAITS: [TraitId, TraitId][] = [
  ['clean_hands', 'smooth_operator'],
  ['clean_hands', 'godfathers_child'],
  ['firebrand', 'party_loyalist'],
];

export const MIN_AGE = 25;
export const MAX_AGE = 60;

export interface CharacterInput {
  name: string;
  gender: 'male' | 'female';
  age: number;
  homeStateCode: string;
  /** LGA id as generated by the world: `${stateCode}-${nnn}` (1-based index into the state's LGA list). */
  homeLgaId: string;
  background: string;
  traits: string[];
}

export interface CharacterBuild {
  stats: Stats;
  wallet: number;
  warChest: number;
}

export type ValidationResult = { ok: true } | { ok: false; errors: Record<string, string> };

const NAME_RE = /^[\p{L}][\p{L}'’. -]*[\p{L}.]$/u;

export function validateName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 40) return 'Name must be 3 to 40 characters.';
  if (!NAME_RE.test(name)) return 'Name can only contain letters, spaces, hyphens, apostrophes and dots.';
  if (name.split(' ').filter((p) => p.replace(/\./g, '').length > 0).length < 2) return 'Give first name and surname.';
  const words = name.toLowerCase().split(/[\s-]+/);
  if (words.some((w) => BLOCKED_SURNAMES.includes(w))) return 'That name is too close to a real politician. Abeg, pick a fictional one.';
  return null;
}

export function lgaIndexFromId(stateCode: string, lgaId: string): number | null {
  const m = /^([A-Z]{2})-(\d{3})$/.exec(lgaId);
  if (!m || m[1] !== stateCode) return null;
  return Number(m[2]) - 1;
}

export function validateCharacter(input: CharacterInput, states: readonly StateData[] = STATES): ValidationResult {
  const errors: Record<string, string> = {};
  const nameErr = validateName(input.name ?? '');
  if (nameErr) errors.name = nameErr;
  if (input.gender !== 'male' && input.gender !== 'female') errors.gender = 'Pick a gender.';
  if (!Number.isInteger(input.age) || input.age < MIN_AGE || input.age > MAX_AGE) errors.age = `Age must be a whole number from ${MIN_AGE} to ${MAX_AGE}.`;

  const state = states.find((s) => s.code === input.homeStateCode);
  if (!state) errors.homeStateCode = 'Unknown state.';
  else {
    const idx = lgaIndexFromId(state.code, input.homeLgaId ?? '');
    if (idx === null || idx < 0 || idx >= state.lgas.length) errors.homeLgaId = `That LGA is not in ${state.name}.`;
  }

  if (!(BACKGROUND_IDS as readonly string[]).includes(input.background)) errors.background = 'Pick a background.';

  const traits = Array.isArray(input.traits) ? input.traits : [];
  if (traits.length !== 2) errors.traits = 'Pick exactly 2 traits.';
  else if (traits[0] === traits[1]) errors.traits = 'Pick 2 different traits.';
  else if (!traits.every((t) => (TRAIT_IDS as readonly string[]).includes(t))) errors.traits = 'Unknown trait.';
  else {
    const clash = INCOMPATIBLE_TRAITS.find(([a, b]) => traits.includes(a) && traits.includes(b));
    if (clash) errors.traits = `${TRAITS[clash[0]].label} and ${TRAITS[clash[1]].label} cannot go together.`;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

/** Starting stats and money for a valid input. Throws if the input is invalid. */
export function buildCharacter(input: CharacterInput): CharacterBuild {
  const v = validateCharacter(input);
  if (!v.ok) throw new Error(`Invalid character: ${Object.values(v.errors).join(' ')}`);
  const background = BACKGROUNDS[input.background as BackgroundId];
  const traits = input.traits.map((t) => TRAITS[t as TraitId]);
  return {
    stats: applyStatMods(background.stats, ...traits.map((t) => t.mods)),
    wallet: background.startingWallet + traits.reduce((s, t) => s + (t.walletBonus ?? 0), 0),
    warChest: 0,
  };
}
