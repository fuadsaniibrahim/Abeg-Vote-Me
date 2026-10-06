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
import { clearCookies, useCookieJar } from './support';

let ctx: AppContext;
let server: FastifyInstance;

beforeAll(async () => {
  useCookieJar();
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
beforeEach(() => {
  clearCookies();
  useAuth.setState({ user: null, status: 'ready' });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/verify" element={<VerifyScreen />} />
        <Route path="/dashboard" element={<p>GAME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function latestToken(email: string): Promise<string> {
  const r = await ctx.db.query<{ body: string }>('SELECT body FROM outbox_emails WHERE to_email = $1 ORDER BY id DESC LIMIT 1', [email]);
  return /token=([A-Za-z0-9_-]+)/.exec(r.rows[0]!.body)![1]!;
}

async function fillRegister(user: ReturnType<typeof userEvent.setup>, username: string, opts: { email?: string; terms?: boolean } = {}) {
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
  if (opts.email) await user.type(screen.getByLabelText('Email (optional)'), opts.email);
  if (opts.terms !== false) await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('sign up and log in with a username against the real server', () => {
  it('registers with only a username and password and goes straight into the game', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await fillRegister(user, 'Naija_Voter');
    expect(await screen.findByText('GAME SCREEN')).toBeInTheDocument();
    expect(useAuth.getState().user).toMatchObject({ username: 'Naija_Voter', email: null });
    const row = await ctx.db.query("SELECT email FROM users WHERE username_normalized = 'naija_voter'");
    expect(row.rows).toEqual([{ email: null }]);
  });

  it('blocks submit until terms are accepted', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await fillRegister(user, 'no_terms', { terms: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/accept the terms/);
  });

  it('shows the server error when the username is taken or invalid', async () => {
    const user = userEvent.setup();
    const view = renderAt('/register');
    await fillRegister(user, 'NAIJA_VOTER');
    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken.');
    view.unmount();
    renderAt('/register');
    await fillRegister(user, 'no spaces');
    expect(await screen.findByRole('alert')).toHaveTextContent(/3-20 letters, numbers or underscores/);
  });

  it('an optional email can be given and confirmed from the emailed link, once', async () => {
    const user = userEvent.setup();
    const reg = renderAt('/register');
    await fillRegister(user, 'with_mail', { email: 'e2e@test.ng' });
    expect(await screen.findByText('GAME SCREEN')).toBeInTheDocument();
    reg.unmount();
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
    await user.type(screen.getByLabelText('Username'), 'naija_voter');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no correct/);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('GAME SCREEN')).toBeInTheDocument();
    expect(useAuth.getState().user).toMatchObject({ username: 'Naija_Voter' });
  });

  it('stays logged in: reopening the app with the saved cookie restores the user without logging in again', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Username'), 'Naija_Voter');
    await user.type(screen.getByLabelText('Password'), 'e2e-password-1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('GAME SCREEN')).toBeInTheDocument();
    // a fresh page load: the app state is empty, only the browser's cookie remains
    useAuth.setState({ user: null, status: 'idle' });
    await useAuth.getState().load();
    expect(useAuth.getState()).toMatchObject({ status: 'ready', user: { username: 'Naija_Voter' } });
  });
});
