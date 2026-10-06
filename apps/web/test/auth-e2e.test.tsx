// End to end: real React screens talking over HTTP to the real Fastify server on an in-memory Postgres (PGlite).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app';
import type { AppContext } from '../../server/src/context';
import { createTestContext } from '../../server/test/helpers';
import { setApiBase } from '../src/api/client';
import { LoginScreen, RegisterScreen } from '../src/screens/AuthScreens';
import { VerifyScreen } from '../src/screens/VerifyScreen';
import { useAuth } from '../src/store/auth';

let ctx: AppContext;
let server: FastifyInstance;

beforeAll(async () => {
  ctx = await createTestContext();
  ctx.game = { ...ctx.game, rateLimits: { ...ctx.game.rateLimits, authPerMinute: 1000 } };
  server = await buildApp(ctx);
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  setApiBase(address);
});
afterAll(async () => {
  await server.close();
  await ctx.db.close();
});
beforeEach(() => useAuth.setState({ user: null, status: 'ready' }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/verify" element={<VerifyScreen />} />
        <Route path="/home" element={<p>HOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function latestToken(email: string): Promise<string> {
  const r = await ctx.db.query<{ body: string }>('SELECT body FROM outbox_emails WHERE to_email = $1 ORDER BY id DESC LIMIT 1', [email]);
  return /token=([A-Za-z0-9_-]+)/.exec(r.rows[0]!.body)![1]!;
}

describe('register → verify → login against the real server', () => {
  it('registers through the form and lands on home', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await user.type(screen.getByLabelText('Email'), 'e2e@test.ng');
    await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(useAuth.getState().user).toMatchObject({ email: 'e2e@test.ng', emailVerified: false });
    const row = await ctx.db.query("SELECT 1 FROM users WHERE email_normalized = 'e2e@test.ng'");
    expect(row.rows).toHaveLength(1);
  });

  it('blocks submit until terms are accepted', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await user.type(screen.getByLabelText('Email'), 'noterms@test.ng');
    await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/accept the terms/);
  });

  it('shows the server error when the email is already taken', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await user.type(screen.getByLabelText('Email'), 'E2E@test.ng');
    await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
  });

  it('verifies the email from the emailed link, and the link cannot be reused', async () => {
    const token = await latestToken('e2e@test.ng');
    const first = renderAt(`/verify?token=${token}`);
    expect(await screen.findByText(/Email confirmed/)).toBeInTheDocument();
    first.unmount();
    const verified = await ctx.db.query<{ v: boolean }>("SELECT email_verified_at IS NOT NULL AS v FROM users WHERE email_normalized = 'e2e@test.ng'");
    expect(verified.rows[0]!.v).toBe(true);
    renderAt(`/verify?token=${token}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid, used or expired/);
  });

  it('shows an error for a wrong password and logs in with the right one', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Email'), 'e2e@test.ng');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no correct/);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(useAuth.getState().user).toMatchObject({ email: 'e2e@test.ng', emailVerified: true });
  });
});
