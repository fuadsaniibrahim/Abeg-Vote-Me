// End to end: real screens → HTTP/WebSocket → real server → in-memory Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io, type Socket } from 'socket.io-client';
import { createCharacterViaApi, cookieHeader, renderAt, signUp, startServer, useCookieJar, type TestServer } from './support';
import { useGame } from '../src/store/game';

let srv: TestServer;
beforeAll(async () => {
  useCookieJar();
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
});

describe('character creation wizard', () => {
  it('a signed-in player without a character is sent to the wizard', async () => {
    await signUp(srv, 'nochar');
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Who you be' })).toBeInTheDocument();
  });

  it('walks through all steps and creates the character on the server', async () => {
    await signUp(srv, 'wizard');
    const user = userEvent.setup();
    renderAt('/create');
    await user.type(await screen.findByLabelText('Full name'), 'Amaka Nwosu');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.selectOptions(screen.getByLabelText('Home state'), 'EN');
    await user.selectOptions(screen.getByLabelText('Home LGA'), 'EN-013'); // Nsukka
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /Journalist/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled(); // no traits yet
    await user.click(screen.getByRole('button', { name: /Clean Hands/ }));
    // Godfather's Boy/Girl clashes with Clean Hands, so it is disabled
    expect(screen.getByRole('button', { name: /Godfather/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Social Media Star/ }));
    expect(screen.getByRole('button', { name: /Workhorse/ })).toBeDisabled(); // already 2
    await user.click(next);
    expect(screen.getByText(/Journalist from Nsukka, Enugu/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start my career' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();

    const row = await srv.ctx.db.query<{ name: string; home_lga_id: string; traits: string[] }>("SELECT name, home_lga_id, traits FROM characters WHERE name = 'Amaka Nwosu'");
    expect(row.rows[0]).toEqual({ name: 'Amaka Nwosu', home_lga_id: 'EN-013', traits: ['clean_hands', 'social_media_star'] });
  });

  it('shows the engine validation message for a single-word name and blocks Next', async () => {
    await signUp(srv, 'badname');
    const user = userEvent.setup();
    renderAt('/create');
    await user.type(await screen.findByLabelText('Full name'), 'Amaka');
    expect(screen.getByRole('alert')).toHaveTextContent(/first name and surname/);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

describe('citizen screens', () => {
  beforeAll(async () => {
    await signUp(srv, 'citizen');
    await createCharacterViaApi('Tunde Balogun');
  });

  it('dashboard shows office, party, money, energy, stats and the in-game date', async () => {
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Citizen').length).toBeGreaterThan(0);
    expect(screen.getByText('No party')).toBeInTheDocument();
    expect(screen.getAllByText('₦1,500,000').length).toBeGreaterThan(0); // trader starting wallet
    expect(screen.getByText('100/100')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Charisma' })).toHaveAttribute('aria-valuenow');
    expect((await screen.findAllByLabelText('In-game date'))[0]).toHaveTextContent(/January 2027/);
  });

  it('party hub: join a party, see it reflected, then leave', async () => {
    const user = userEvent.setup();
    renderAt('/parties');
    const card = (await screen.findByRole('heading', { name: /People's Renewal Movement/ })).closest('div.rounded-2xl') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Join' }));
    expect(await screen.findByText("Welcome to People's Renewal Movement!")).toBeInTheDocument();
    await waitFor(() => expect(useGame.getState().profile?.party?.code).toBe('PRM'));
    await user.click(within(card).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText("You left People's Renewal Movement.")).toBeInTheDocument();
    await waitFor(() => expect(useGame.getState().profile?.party).toBeNull());
  });

  it('actions: rally costs energy and shows the outcome; second rally hits the cooldown', async () => {
    const user = userEvent.setup();
    renderAt('/actions');
    await user.click(await screen.findByRole('button', { name: 'Go to rally' }));
    expect(await screen.findByText(/rally|Rain|crowd/i, { selector: '[role=status]' })).toBeInTheDocument();
    await waitFor(() => expect(useGame.getState().profile?.energy).toBe(85));
    await user.click(screen.getByRole('button', { name: 'Go to rally' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Wait/);
  });

  it('actions: start and sign a petition', async () => {
    const user = userEvent.setup();
    renderAt('/actions');
    await user.type(await screen.findByLabelText('Petition title'), 'Fix Ibadan roads now');
    await user.type(screen.getByLabelText('What should change?'), 'The potholes don swallow three cars this month alone.');
    await user.click(screen.getByRole('button', { name: 'Start petition' }));
    expect(await screen.findByText('Petition published.')).toBeInTheDocument();
    expect(await screen.findByText('Fix Ibadan roads now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signed' })).toBeDisabled();
  });

  it('finance: start a business and see it with the transaction', async () => {
    const user = userEvent.setup();
    renderAt('/finance');
    await user.type(await screen.findByLabelText('Business name'), 'Iya Basira Provisions');
    await user.click(screen.getByRole('button', { name: 'Start business' }));
    expect(await screen.findByText(/Business don open! It cost ₦300,000/)).toBeInTheDocument();
    expect(await screen.findByText('Iya Basira Provisions')).toBeInTheDocument();
    expect(screen.getByText('Started business')).toBeInTheDocument();
  });

  it('news feed shows headlines generated from my actions', async () => {
    renderAt('/news');
    expect(await screen.findByText(/Naija Daily/, { selector: 'p.tracking-\\[0\\.3em\\]' })).toBeInTheDocument();
    const items = await screen.findAllByText(/Tunde Balogun/);
    expect(items.length).toBeGreaterThan(0);
  });

  it('profile shows the avatar, stats and lets me log out', async () => {
    const user = userEvent.setup();
    renderAt('/profile');
    expect((await screen.findAllByRole('img', { name: 'Avatar of Tunde Balogun' })).length).toBeGreaterThan(0);
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(useGame.getState().profile).toBeNull());
  });
});

describe('live chat and notifications', () => {
  let other: Socket;
  let otherCookie: string;

  beforeAll(async () => {
    await signUp(srv, 'chatter_b');
    await createCharacterViaApi('Bisi Ogunleye');
    otherCookie = cookieHeader();
    other = io(srv.url, { path: '/socket.io', transports: ['websocket'], extraHeaders: { cookie: otherCookie }, forceNew: true });
    await new Promise<void>((r) => other.on('connect', () => r()));
    await new Promise((r) => other.emit('chat:join', 'global', r));

    await signUp(srv, 'chatter_a');
    await createCharacterViaApi('Kunle Adesanya');
  });
  afterAll(() => {
    other.disconnect();
  });

  it('sends from the chat screen; another player receives it live, and their reply appears live', async () => {
    const user = userEvent.setup();
    const received: string[] = [];
    other.on('chat:message', (m: { body: string }) => received.push(m.body));
    renderAt('/chat');
    expect(await screen.findByRole('tab', { name: 'Naija (global)' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Message'), 'How market today?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(received).toContain('How market today?'));
    expect(within(screen.getByRole('list', { name: 'Messages' })).getByText(/How market today\?/)).toBeInTheDocument();

    await new Promise((r) => other.emit('chat:send', { channel: 'global', body: 'Market dey boom!' }, r));
    expect(await within(screen.getByRole('list', { name: 'Messages' })).findByText(/Market dey boom!/)).toBeInTheDocument();
  });

  it('shows the filter error when sending incitement', async () => {
    const user = userEvent.setup();
    renderAt('/chat');
    await screen.findByRole('tab', { name: 'Naija (global)' });
    await user.type(screen.getByLabelText('Message'), 'we must exterminate them');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/breaks the rules/);
  });

  it('a donation from another player shows up in the bell immediately', async () => {
    renderAt('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const me = useGame.getState().profile!;
    // the other player donates through the real API with their own cookie
    const res = await fetch(`${srv.url}/api/donations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: otherCookie },
      body: JSON.stringify({ recipientType: 'candidate', recipientId: me.id, amount: 15_000 }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    expect(await screen.findByText(/donated ₦15,000 to your campaign/)).toBeInTheDocument();
  });
});
