import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/engine/galaxy';
import { hashSeed, Rng } from '../src/engine/random';

/**
 * Determinism contract (PLAN §7): same seed + same options → deep-equal
 * galaxy, every time. This is the regression that catches any
 * nondeterminism creeping into generation (Object.keys drift, Math.random,
 * unstable sorts, …).
 */
describe('determinism — galaxy generation', () => {
  it('same seed produces deep-equal galaxies across repeated calls', () => {
    for (const seed of [0, 7, 42, 987654321]) {
      const a = generateGalaxy(seed);
      const b = generateGalaxy(seed);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('same seed + same options is stable; frequency option is honored', () => {
    const a = generateGalaxy(555, { supernovaFrequency: 'normal' });
    const b = generateGalaxy(555, { supernovaFrequency: 'normal' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const zero = generateGalaxy(555, { supernovaFrequency: 'zero' });
    expect(zero.systems.some((s) => s.supernovaCandidate)).toBe(false);
  });

  it('different seeds produce different galaxies', () => {
    const a = generateGalaxy(1);
    const b = generateGalaxy(2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('a 100-seed sweep satisfies the core invariants without throwing', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = generateGalaxy(seed);
      expect(g.systems).toHaveLength(20);
      expect(g.systems.find((s) => s.id === g.homeworldId)!.ownerId).toBe('player');
      // ≥ 2 viable early targets (the critical fairness invariant).
      const hw = g.systems.find((s) => s.id === g.homeworldId)!;
      const targets = g.systems.filter(
        (s) =>
          s.id !== hw.id &&
          Math.max(Math.abs(s.gx - hw.gx), Math.abs(s.gy - hw.gy)) <= 1 &&
          s.planet !== null &&
          (s.ownerId === null || s.ownerId.startsWith('ind-')) &&
          s.planet.development <= 2,
      ).length;
      expect(targets, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('named seeds (FNV-1a) generate valid, reproducible galaxies', () => {
    const a = generateGalaxy(hashSeed('tutorial'));
    const b = generateGalaxy(hashSeed('tutorial'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.systems).toHaveLength(20);
  });

  it('the rng stream itself is reproducible (full pipeline input)', () => {
    const a = new Rng(20261025);
    const b = new Rng(20261025);
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      expect(a.int(1000)).toBe(b.int(1000));
    }
  });
});
