import type { Stats } from '@avm/engine';

// Typed fetch wrapper. The client only sends intents; the server is the source of truth.

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: 'player' | 'admin';
}

export interface WorldSummary {
  seeded: boolean;
  seed: string | null;
  counts: Record<string, number>;
  seatsHeldByNpcs: number;
  seatsHeldByPlayers: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let apiBase = import.meta.env.VITE_API_BASE ?? '';

/** Override the API origin (tests point this at an in-process server). */
export function setApiBase(base: string) {
  apiBase = base;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Network wahala: we no fit reach the server. Check your connection.');
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string };
    const fallback = res.status === 429 ? 'Too many tries. Rest small, then try again.' : `Request failed (${res.status})`;
    throw new ApiError(res.status, d.error ?? 'http_error', d.message ?? fallback);
  }
  return data as T;
}

export const authApi = {
  me: () => api<{ user: PublicUser }>('/api/auth/me'),
  register: (email: string, password: string, acceptTerms: boolean) =>
    api<{ user: PublicUser }>('/api/auth/register', { method: 'POST', body: { email, password, acceptTerms } }),
  login: (email: string, password: string) => api<{ user: PublicUser }>('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  verifyEmail: (token: string) => api<{ user: PublicUser }>('/api/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: () => api<{ ok: true }>('/api/auth/resend-verification', { method: 'POST' }),
};

export const worldApi = {
  summary: () => api<WorldSummary>('/api/world/summary'),
};

// ---------- game types ----------

export interface PartyRef {
  id: string;
  code: string;
  name: string;
  color: string;
}

export interface Profile {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  homeStateCode: string;
  homeStateName: string;
  homeLgaId: string;
  homeLgaName: string;
  background: string;
  backgroundLabel: string;
  perks: { id: string; label: string }[];
  traits: string[];
  stats: Stats;
  wallet: number;
  warChest: number;
  energy: number;
  journalistRep: number;
  avatarSeed: string;
  party: PartyRef | null;
  groups: string[];
  volunteerRoles: string[];
  office: { id: string; name: string; kind: string; since: string; termEndsAt: string | null; autopilot: boolean; monthlySalary: number } | null;
  activeBusinesses: number;
  unreadNotifications: number;
}

export interface CharacterForm {
  name: string;
  gender: 'male' | 'female';
  age: number;
  homeStateCode: string;
  homeLgaId: string;
  background: string;
  traits: string[];
}

export interface PartyInfo extends PartyRef {
  slogan: string;
  ideology: string;
  isIndependent: boolean;
  treasury: number;
  playerMembers: number;
  seatsHeld: number;
}

export interface NewsItem {
  id: number;
  kind: string;
  headline: string;
  body: string;
  stateCode: string | null;
  source: 'world' | 'player' | 'story';
  createdAt: string;
  actorName: string | null;
  actorId: string | null;
}

export interface Petition {
  id: string;
  title: string;
  body: string;
  creatorName: string;
  signatures: number;
  signed: boolean;
  createdAt: string;
}

export interface Protest {
  id: string;
  stateName: string;
  issue: string;
  title: string;
  endsAt: string;
  organiserName: string;
  participants: number;
}

export interface Finance {
  wallet: number;
  warChest: number;
  transactions: { id: number; account: 'wallet' | 'warChest'; delta: number; reason: string; createdAt: string }[];
  businesses: { id: string; name: string; sector: string; sectorLabel: string; capital: number; earned: number; createdAt: string }[];
}

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  channel: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface Clock {
  date: { year: number; month: number; day: number; monthsElapsed: number };
  msPerGameMonth: number;
  serverTime: number;
}

export interface ActionOutcome {
  text: string;
  tag: string;
  mods: Partial<Stats>;
  fined?: number;
}

// ---------- seats and map ----------

export interface Holder {
  tenureId: number;
  type: 'npc' | 'player';
  id: string;
  name: string;
  avatarSeed: string | null;
  party: { code: string; name: string; color: string } | null;
  since: string;
  termEndsAt: string | null;
  holdingOver: boolean;
  autopilot: boolean;
  startReason: string;
}

export interface Seat {
  id: string;
  kind: string;
  kindLabel: string;
  name: string;
  stateCode: string | null;
  districtId: string | null;
  constituencyId: string | null;
  lgaId: string | null;
  wardId: string | null;
  holder: Holder | null;
}

export interface SeatDetail {
  seat: Seat & { salary: number; mine: boolean };
  deputy: Seat | null;
  principal: Seat | null;
  chiefOfStaff: { id: string; name: string } | null;
  acting: { type: 'holder' | 'chief_of_staff' | 'deputy' | 'autopilot'; name: string | null } | null;
  openElection: { id: number; kind: 'by_election' | 'general'; reason: string; scheduledFor: string } | null;
}

export interface SeatHistoryEntry {
  tenureId: number;
  type: 'npc' | 'player';
  id: string;
  name: string;
  party: { code: string; color: string } | null;
  startedAt: string;
  endedAt: string | null;
  startReason: string;
  endReason: string | null;
}

export interface CountryMap {
  parties: { code: string; name: string; color: string }[];
  states: { code: string; name: string; zone: string; isFct: boolean; governor: Holder | null; seatsByParty: Record<string, number>; leadingParty: string | null; insecurity: number | null }[];
}

export interface StateMap {
  state: { code: string; name: string; capital: string; zone: string; isFct: boolean; population: number; wealth: number; insecurity: number };
  governor: Seat | null;
  deputyGovernor: Seat | null;
  senators: (Seat & { districtName: string })[];
  reps: (Seat & { constituencyName: string })[];
  lgas: { id: string; name: string; wards: number; chairman: Seat }[];
}

export interface ConstituencyMap {
  constituency: { id: string; name: string; stateCode: string; population: number; wealth: number };
  rep: Seat;
  senators: (Seat & { districtName: string })[];
  lgas: { id: string; name: string; share: number; chairman: Seat | null }[];
}

export interface LgaMap {
  lga: { id: string; name: string; stateCode: string; isCapital: boolean; population: number; wealth: number };
  chairman: Seat;
  constituencies: { id: string; name: string }[];
  district: { id: string; name: string } | null;
  wards: { id: string; name: string; number: number; councillor: Seat | null; wardChairman: Seat | null }[];
}

export interface Eligibility {
  eligible: boolean;
  reasons: { code: string; message: string }[];
}

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });

export const gameApi = {
  me: () => api<{ character: Profile }>('/api/me/character'),
  createCharacter: (f: CharacterForm) => post<{ character: Profile }>('/api/characters', f),
  publicProfile: (id: string) => api<{ character: { id: string; name: string; homeStateName: string; party: PartyRef | null; publicImage: number } }>(`/api/characters/${id}`),
  searchCharacters: (q: string) => api<{ characters: { id: string; name: string; stateName: string }[] }>(`/api/characters?q=${encodeURIComponent(q)}`),
  clock: () => api<Clock>('/api/world/clock'),
  parties: () => api<{ parties: PartyInfo[] }>('/api/parties'),
  joinParty: (code: string) => post<{ ok: true }>(`/api/parties/${code}/join`),
  leaveParty: () => post<{ ok: true }>('/api/parties/leave'),
  donate: (recipientType: 'party' | 'candidate', recipientId: string, amount: number) => post<{ wallet: number; recipient: string }>('/api/donations', { recipientType, recipientId, amount }),
  rally: () => post<{ outcome: ActionOutcome; energy: number }>('/api/actions/rally'),
  volunteer: (role: 'ward_agent' | 'delegate') => post<{ ok: true }>('/api/volunteer', { role }),
  petitions: () => api<{ petitions: Petition[] }>('/api/petitions'),
  createPetition: (title: string, body: string) => post<{ id: string }>('/api/petitions', { title, body }),
  signPetition: (id: string) => post<{ signatures: number }>(`/api/petitions/${id}/sign`),
  protests: () => api<{ protests: Protest[] }>('/api/protests'),
  callProtest: (issue: string, title: string) => post<{ id: string }>('/api/protests', { issue, title }),
  joinProtest: (id: string) => post<{ outcome: ActionOutcome }>(`/api/protests/${id}/join`),
  joinGroup: (kind: string) => post<{ ok: true }>(`/api/groups/${kind}/join`),
  leaveGroup: (kind: string) => post<{ ok: true }>(`/api/groups/${kind}/leave`),
  startBusiness: (name: string, sector: string, capital: number) => post<{ id: string; cost: number }>('/api/businesses', { name, sector, capital }),
  finance: () => api<Finance>('/api/me/finance'),
  transfer: (from: 'wallet' | 'warChest', to: 'wallet' | 'warChest', amount: number) => post<{ wallet: number; warChest: number; flags: string[] }>('/api/me/transfer', { from, to, amount }),
  news: (state?: string) => api<{ items: NewsItem[] }>(`/api/news${state ? `?state=${state}` : ''}`),
  storyClaims: () => api<{ claims: { id: string; label: string; needsParty: boolean }[] }>('/api/stories/claims'),
  publishStory: (targetId: string, claim: string, partyCode?: string) => post<{ id: string; headline: string; journalistRep: number }>('/api/stories', { targetId, claim, partyCode }),
  notifications: () => api<{ notifications: Notification[] }>('/api/notifications'),
  markRead: (ids?: number[]) => post<{ marked: number }>('/api/notifications/read', ids ? { ids } : {}),
  chatChannels: () => api<{ channels: { id: string; label: string }[] }>('/api/chat/channels'),
  chatHistory: (channel: string) => api<{ messages: ChatMessage[] }>(`/api/chat/messages?channel=${encodeURIComponent(channel)}`),
  openDm: (characterId: string) => post<{ channel: string }>('/api/chat/dm', { characterId }),
  block: (characterId: string) => post<{ ok: true }>('/api/chat/blocks', { characterId }),
  report: (targetType: string, targetId: string, reason: string) => post<{ id: number }>('/api/reports', { targetType, targetId, reason }),
  countryMap: () => api<CountryMap>('/api/map/country'),
  stateMap: (code: string) => api<StateMap>(`/api/map/states/${encodeURIComponent(code)}`),
  constituencyMap: (id: string) => api<ConstituencyMap>(`/api/map/constituencies/${encodeURIComponent(id)}`),
  lgaMap: (id: string) => api<LgaMap>(`/api/map/lgas/${encodeURIComponent(id)}`),
  seat: (id: string) => api<SeatDetail>(`/api/seats/${encodeURIComponent(id)}`),
  seatHistory: (id: string) => api<{ history: SeatHistoryEntry[] }>(`/api/seats/${encodeURIComponent(id)}/history`),
  eligibility: (id: string) => api<Eligibility>(`/api/seats/${encodeURIComponent(id)}/eligibility`),
  resign: () => post<{ ok: true; seatId: string; plan: string }>('/api/office/resign', { confirm: true }),
  setChiefOfStaff: (characterId: string | null) => post<{ ok: true; chiefOfStaff: { id: string; name: string } | null }>('/api/office/chief-of-staff', { characterId }),
};
