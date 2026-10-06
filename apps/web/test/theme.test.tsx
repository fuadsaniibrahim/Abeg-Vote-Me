import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../src/components/Layout';
import { useTheme } from '../src/store/theme';

describe('theme toggle', () => {
  it('switches between light and dark, sets the html class and remembers the choice', async () => {
    useTheme.setState({ theme: 'light' });
    document.documentElement.classList.remove('dark');
    render(
      <MemoryRouter>
        <Layout>
          <p>content</p>
        </Layout>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('avm.theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('avm.theme')).toBe('light');
  });
});
