import { describe, expect, it } from 'vitest';
import { hashSeed, Rng } from '../src/engine/random';

describe('Rng (sfc32) — determinism', () => {
  it('same seed → identical stream', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds → different streams', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 100 }, () => a.next());
    const sb = Array.from({ length: 100 }, () => b.next());
    expect(JSON.stringify(sa)).not.toBe(JSON.stringify(sb));
  });

  it('all draws are floats in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('restoring serialized state continues the exact stream', () => {
    const a = new Rng(99);
    Array.from({ length: 100 }, () => a.next());
    const state = a.state();
    const second = Array.from({ length: 100 }, () => a.next());

    const b = new Rng(state);
    const resumed = Array.from({ length: 100 }, () => b.next());
    expect(resumed).toEqual(second);

    // And the restored rng keeps drifting correctly afterward.
    expect(new Rng(b.state()).next()).toBe(a.next());
  });

  it('int/intRange stay in bounds', () => {
    const r = new Rng(5);
    for (let i = 0; i < 10000; i++) {
      const x = r.int(10);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(10);
      const y = r.intRange(3, 9);
      expect(y).toBeGreaterThanOrEqual(3);
      expect(y).toBeLessThan(9);
    }
  });

  it('pick covers the whole array', () => {
    const r = new Rng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.pick([0, 1, 2, 3, 4]));
    expect(seen.size).toBe(5);
  });

  it('weighted respects proportions (sanity bands)', () => {
    const r = new Rng(23);
    const counts = [0, 0, 0];
    for (let i = 0; i < 12000; i++) {
      const v = r.weighted([
        ['a', 50],
        ['b', 30],
        ['c', 20],
      ]);
      counts[['a', 'b', 'c'].indexOf(v)]++;
    }
    const total = counts[0] + counts[1] + counts[2];
    expect(counts[0] / total).toBeGreaterThan(0.45);
    expect(counts[0] / total).toBeLessThan(0.55);
    expect(counts[1] / total).toBeGreaterThan(0.25);
    expect(counts[1] / total).toBeLessThan(0.35);
    expect(counts[2] / total).toBeGreaterThan(0.15);
    expect(counts[2] / total).toBeLessThan(0.25);
  });

  it('shuffled is a deterministic permutation', () => {
    const a = new Rng(31).shuffled([1, 2, 3, 4, 5, 6, 7]);
    const b = new Rng(31).shuffled([1, 2, 3, 4, 5, 6, 7]);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(a).toEqual(b);
  });
});

describe('hashSeed (FNV-1a)', () => {
  it('is stable, unsigned 32-bit, and distinguishes strings', () => {
    expect(hashSeed('tutorial')).toBe(hashSeed('tutorial'));
    const h = hashSeed('2026-10-25');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(hashSeed('tutorial')).not.toBe(hashSeed('campaign'));
  });

  it('named seeds produce valid deterministic galaxies later', () => {
    // (smoke: the galaxy module consumes hashSeed output as a seed)
    const r1 = new Rng(hashSeed('x'));
    const r2 = new Rng(hashSeed('x'));
    expect(r1.next()).toBe(r2.next());
  });
});
