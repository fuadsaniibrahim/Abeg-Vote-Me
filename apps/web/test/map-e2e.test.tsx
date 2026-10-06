// End to end: map, state, constituency, LGA and seat screens → real server → in-memory Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { takeSeat } from '../../server/src/game/seats';
import { createCharacterViaApi, renderAt, signUp, startServer, useCookieJar, type TestServer } from './support';

let srv: TestServer;
beforeAll(async () => {
  useCookieJar();
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
});

const holderOf = async (seatId: string) =>
  (await srv.ctx.db.query<{ name: string }>('SELECT COALESCE(c.name, n.name) AS name FROM seat_tenures t LEFT JOIN characters c ON c.id = t.character_id LEFT JOIN npcs n ON n.id = t.npc_id WHERE t.seat_id = $1 AND t.ended_at IS NULL', [seatId])).rows[0]?.name;

describe('map screens', () => {
  beforeAll(async () => {
    await signUp(srv, 'mapper');
    await createCharacterViaApi('Bayo Akande');
  });

  it('country map: one tile per state, coloured by party; tapping a state opens its seats', async () => {
    const user = userEvent.setup();
    renderAt('/map');
    expect(await screen.findByRole('heading', { name: 'Map of Nigeria' })).toBeInTheDocument();
    const map = await screen.findByRole('group', { name: 'States of Nigeria' });
    const tiles = within(map).getAllByRole('link');
    expect(tiles).toHaveLength(37);
    const gov = await holderOf('GOV-LA');
    const lagos = within(map).getByRole('link', { name: new RegExp(`^Lagos: Governor ${gov}`) });
    expect(within(map).getByRole('link', { name: /^Federal Capital Territory: most seats/ })).toBeInTheDocument();
    // tile colour is a party colour, not the vacant grey
    expect(lagos.querySelector('rect')!.getAttribute('fill')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(lagos.querySelector('rect')!.getAttribute('fill')).not.toBe('#9ca3af');

    await user.click(lagos);
    expect(await screen.findByRole('heading', { name: 'Lagos State' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Senate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'House of Representatives (24)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Governor/ })).toHaveTextContent(gov!);
  });

  it('state view: the LGA grid opens an LGA with its wards, councillors and ward chairmen', async () => {
    const user = userEvent.setup();
    renderAt('/map/KN');
    const grid = await screen.findByRole('group', { name: 'Local governments of Kano' });
    const lgaTiles = within(grid).getAllByRole('link');
    expect(lgaTiles).toHaveLength(44);
    const first = (await srv.ctx.db.query<{ name: string }>("SELECT name FROM lgas WHERE id = 'KN-001'")).rows[0]!.name;
    // keyboard works too: focus the tile and press Enter
    const tile = within(grid).getByRole('link', { name: new RegExp(`^${first} LGA: Chairman`) });
    tile.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: `${first} LGA` })).toBeInTheDocument();
    const wards = (await srv.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM wards WHERE lga_id = 'KN-001'")).rows[0]!.n;
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(wards + 1);
    const councillor = await holderOf('CLR-KN-001-W01');
    expect(within(table).getByRole('link', { name: `Councillor, ${first} Ward 1` })).toHaveTextContent(councillor!);
    expect(screen.getByRole('link', { name: 'Nigeria' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kano' })).toBeInTheDocument();
  });

  it('constituency view shows the rep with holder details and its LGAs', async () => {
    const user = userEvent.setup();
    renderAt('/map/LA');
    const name = (await srv.ctx.db.query<{ name: string }>("SELECT name FROM federal_constituencies WHERE id = 'LA-FC01'")).rows[0]!.name;
    await user.click(await screen.findByRole('link', { name: name }));
    expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    const rep = screen.getByRole('link', { name: /Member, House of Representatives/ });
    expect(rep).toHaveTextContent((await holderOf('REP-LA-FC01'))!);
    expect(within(rep).getByText(/NPC/)).toBeInTheDocument();
    await user.click(rep);
    expect(await screen.findByRole('heading', { name: /Member, House of Reps/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Past and present holders' })).toHaveTextContent(/In office when the world began/);
  });
});

describe('seat screen', () => {
  it('shows why I cannot hold a seat elsewhere', async () => {
    await signUp(srv, 'outsider');
    await createCharacterViaApi('Chidi Eze', { age: 30 });
    renderAt('/seats/GOV-LA');
    const why = await screen.findByRole('list', { name: 'Why you cannot hold this seat' });
    expect(why).toHaveTextContent(/at least 35/);
    expect(why).toHaveTextContent(/not your home state/);
    expect(why).toHaveTextContent(/Join a party/);
  });

  it('my office: dashboard links to my seat; I name a chief of staff, then resign and a by-election is called', async () => {
    await signUp(srv, 'aide');
    const aide = (await createCharacterViaApi('Ngozi Aide-Okafor')).character;
    await signUp(srv, 'chairman');
    const me = (await createCharacterViaApi('Sule Lamidi')).character; // OY-006
    await srv.ctx.db.transaction((tx) => takeSeat(tx, srv.ctx.game, { seatId: 'LGC-OY-006', holder: { type: 'player', characterId: me.id }, reason: 'election', term: 'new' }));
    const user = userEvent.setup();
    renderAt('/dashboard');
    const officeLink = await screen.findByRole('link', { name: /Chairman, .* LGA/ });
    expect(screen.getByText('₦450,000')).toBeInTheDocument();
    await user.click(officeLink);

    expect(await screen.findByRole('heading', { name: 'Your office' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Chairman, / }).closest('div')!.parentElement).toHaveTextContent(/Sule Lamidi.*Player/);
    await user.type(screen.getByLabelText('Find a player'), 'Aide');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: 'Name Ngozi' }));
    expect(await screen.findByText(/Ngozi Aide-Okafor is now your chief of staff/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Current:/)).toHaveTextContent('Ngozi Aide-Okafor'));
    const cos = await srv.ctx.db.query("SELECT chief_of_staff_id FROM seat_tenures WHERE seat_id = 'LGC-OY-006' AND ended_at IS NULL");
    expect(cos.rows[0]).toEqual({ chief_of_staff_id: aide.id });

    await user.click(screen.getByRole('button', { name: 'Resign from office' }));
    await user.click(screen.getByRole('button', { name: 'Yes, resign' }));
    expect(await screen.findByText('This seat is vacant.')).toBeInTheDocument();
    expect(screen.getByText(/By-election scheduled in 3 days/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your office' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Past and present holders' })).toHaveTextContent(/Sule Lamidi.*Resigned/);
  });
});
