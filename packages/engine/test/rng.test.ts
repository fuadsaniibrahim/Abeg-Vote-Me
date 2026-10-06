import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';

const seq = (r: Rng, n = 20) => Array.from({ length: n }, () => r.next());

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    expect(seq(new Rng('abeg'))).toEqual(seq(new Rng('abeg')));
  });

  it('differs for different seeds', () => {
    expect(seq(new Rng('abeg'))).not.toEqual(seq(new Rng('vote')));
  });

  it('produces floats in [0, 1)', () => {
    const r = new Rng(42);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('fork is stable and does not advance the parent', () => {
    const a = new Rng('s');
    const b = new Rng('s');
    const fa = a.fork('x');
    expect(seq(a)).toEqual(seq(b));
    expect(seq(fa)).toEqual(seq(new Rng('s').fork('x')));
    expect(seq(new Rng('s').fork('x'))).not.toEqual(seq(new Rng('s').fork('y')));
  });

  it('can be saved and restored from state', () => {
    const r = new Rng('save');
    seq(r, 5);
    const restored = Rng.fromState('save', r.getState());
    expect(seq(restored)).toEqual(seq(r));
  });

  it('int stays within inclusive bounds and hits both ends', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('weighted respects weights and never picks zero-weight items', () => {
    const r = new Rng('w');
    const counts = { a: 0, b: 0, c: 0 };
    const weights = { a: 1, b: 3, c: 0 };
    for (let i = 0; i < 20000; i++) counts[r.weighted(['a', 'b', 'c'] as const, (k) => weights[k])]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.6);
    expect(counts.b / counts.a).toBeLessThan(3.4);
  });

  it('chance approximates probability', () => {
    const r = new Rng('c');
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 20000).toBeGreaterThan(0.23);
    expect(hits / 20000).toBeLessThan(0.27);
  });

  it('shuffle is a permutation', () => {
    const r = new Rng('sh');
    const items = Array.from({ length: 50 }, (_, i) => i);
    const s = r.shuffle(items);
    expect(s).not.toEqual(items);
    expect([...s].sort((a, b) => a - b)).toEqual(items);
  });

  it('gaussian has roughly the requested mean and sd', () => {
    const r = new Rng('g');
    const xs = Array.from({ length: 20000 }, () => r.gaussian(50, 10));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeGreaterThan(49.5);
    expect(mean).toBeLessThan(50.5);
    expect(sd).toBeGreaterThan(9.5);
    expect(sd).toBeLessThan(10.5);
  });

  it('throws on empty pick and zero total weight', () => {
    const r = new Rng(1);
    expect(() => r.pick([])).toThrow();
    expect(() => r.weighted([1, 2], () => 0)).toThrow();
  });
});
