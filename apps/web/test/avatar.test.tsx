import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, avatarParts } from '../src/components/Avatar';

describe('generated avatar', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(avatarParts('abc')).toEqual(avatarParts('abc'));
    const variants = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(avatarParts(`seed-${i}`))));
    expect(variants.size).toBeGreaterThan(20);
  });

  it('renders an accessible inline SVG with no external images', () => {
    const { container } = render(<Avatar seed="x" name="Ada Obi" />);
    expect(screen.getByRole('img', { name: 'Avatar of Ada Obi' }).tagName.toLowerCase()).toBe('svg');
    expect(container.querySelector('image, img')).toBeNull();
  });
});
