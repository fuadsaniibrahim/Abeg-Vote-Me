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
