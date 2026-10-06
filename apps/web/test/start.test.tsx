import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StartScreen } from '../src/screens/StartScreen';
import { DISCLAIMER_TEXT } from '../src/components/Disclaimer';

afterEach(() => vi.unstubAllGlobals());

function renderStart() {
  return render(
    <MemoryRouter>
      <StartScreen />
    </MemoryRouter>,
  );
}

describe('StartScreen', () => {
  it('shows the fiction and satire disclaimer', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderStart();
    const aside = screen.getByRole('complementary', { name: 'Disclaimer' });
    expect(aside).toHaveTextContent('satire');
    expect(aside).toHaveTextContent('fictional');
    expect(DISCLAIMER_TEXT).toMatch(/real persons/);
  });

  it('offers create account and log in when signed out', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderStart();
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('shows world stats from the API', async () => {
    const summary = { seeded: true, seed: 's', counts: { states: 37, lgas: 774, seats: 1317 }, seatsHeldByNpcs: 1317, seatsHeldByPlayers: 0 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 })));
    renderStart();
    expect(await screen.findByText('1,317')).toBeInTheDocument();
    expect(screen.getByText('774')).toBeInTheDocument();
  });
});
