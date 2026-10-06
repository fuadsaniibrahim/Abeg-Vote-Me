import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('returns parsed JSON on success and sends JSON bodies with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"a":1}' });
  });

  it('turns server errors into ApiError with code and message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"email_taken","message":"Taken"}', { status: 409 })));
    const err = await api('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'email_taken', message: 'Taken' });
  });

  it('gives a friendly message for rate limiting without a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(api('/x')).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/Too many tries/) });
  });

  it('maps network failures to a network ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(api('/x')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
