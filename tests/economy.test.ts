import { describe, expect, it } from 'vitest';
import { ECON } from '../src/data/balance';
import {
  empireIncome,
  productionOf,
} from '../src/engine/economy';
import { dispatchSim, newGame } from '../src/engine/simulation';
import type { Planet, Specialization, System } from '../src/engine/types';

const SEED = 42;
const SPECS: Specialization[] = [
  'industrial',
  'mining',
  'economic',
  'fortress',
  'balanced',
];
const DEVS = [1, 2, 3, 4, 5];

const planet = (spec: Specialization, dev: number): Planet => ({
  name: 'T',
  type: 'garden',
  specialization: spec,
  development: dev,
  population: 10,
  stability: 100,
  garrison: 0,
});

const sys = (id: string, spec: Specialization, dev: number, ownerId: string | null): System => ({
  id,
  name: `T${id}`,
  x: 0,
  y: 0,
  gx: 0,
  gy: 0,
  starClass: 'yellow',
  planet: planet(spec, dev),
  defense: 0,
  ownerId,
  previousOwnerId: null,
  explored: true,
  occupation: 'none',
  destroyed: false,
  instability: 0,
  supernovaCandidate: false,
});

describe('production table (PLAN §8)', () => {
  it('matches the documented values', () => {
    expect(ECON.productionBySpec.industrial).toEqual({ credits: 1, materials: 3, fuel: 1 });
    expect(ECON.productionBySpec.mining).toEqual({ credits: 1, materials: 2, fuel: 2 });
    expect(ECON.productionBySpec.economic).toEqual({ credits: 3, materials: 1, fuel: 1 });
    expect(ECON.productionBySpec.fortress).toEqual({ credits: 1, materials: 1, fuel: 1 });
    expect(ECON.productionBySpec.balanced).toEqual({ credits: 2, materials: 2, fuel: 2 });
  });

  it('productionOf = table × development, for every spec × development', () => {
    for (const spec of SPECS) {
      for (const dev of DEVS) {
        const base = ECON.productionBySpec[spec];
        expect(productionOf(planet(spec, dev)), `${spec} dev ${dev}`).toEqual({
          credits: base.credits * dev,
          materials: base.materials * dev,
          fuel: base.fuel * dev,
        });
      }
    }
  });
});

describe('empire income', () => {
  it('is the table sum over a faction\'s inhabited, non-destroyed systems', () => {
    const systems: System[] = [
      sys('A', 'industrial', 3, 'player'),
      sys('B', 'economic', 2, 'player'),
      sys('C', 'mining', 4, 'rival-0'), // not the player's pool
      sys('D', 'balanced', 5, 'player'),
    ];
    const inc = empireIncome(systems);
    expect(inc).toEqual({
      credits: 1 * 3 + 3 * 2 + 2 * 5,
      materials: 3 * 3 + 1 * 2 + 2 * 5,
      fuel: 1 * 3 + 1 * 2 + 2 * 5,
    });

    systems[3].destroyed = true;
    expect(empireIncome(systems)).toEqual({
      credits: 1 * 3 + 3 * 2,
      materials: 3 * 3 + 1 * 2,
      fuel: 1 * 3 + 1 * 2,
    });

    // Uninhabited systems contribute nothing.
    systems.push({ ...sys('E', 'economic', 5, 'player'), planet: null });
    expect(empireIncome(systems)).toEqual({
      credits: 1 * 3 + 3 * 2,
      materials: 3 * 3 + 1 * 2,
      fuel: 1 * 3 + 1 * 2,
    });

    expect(empireIncome(systems, 'nobody')).toEqual({
      credits: 0,
      materials: 0,
      fuel: 0,
    });
  });
});

describe('per-year production in the tick (acceptance)', () => {
  it('equals the table sum over owned planets in a real galaxy', () => {
    const g = newGame(SEED);
    const exp = { credits: 0, materials: 0, fuel: 0 };
    for (const s of g.galaxy.systems) {
      if (s.ownerId === 'player' && s.planet) {
        const base = ECON.productionBySpec[s.planet.specialization];
        exp.credits += base.credits * s.planet.development;
        exp.materials += base.materials * s.planet.development;
        exp.fuel += base.fuel * s.planet.development;
      }
    }
    expect(empireIncome(g.galaxy.systems)).toEqual(exp);

    const before = { ...g.empire };
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.empire.credits - before.credits).toBe(exp.credits);
    expect(next.empire.materials - before.materials).toBe(exp.materials);
    expect(next.empire.fuel - before.fuel).toBe(exp.fuel);
  });

  it('the displayed income source and the engine agree every year (C5 acceptance)', () => {
    // EmpireBar renders empireIncome(state); the engine applies the same
    // function in the resources stage. Assert the two cannot drift.
    let g = newGame(SEED);
    for (let i = 0; i < 10; i++) {
      const shown = empireIncome(g.galaxy.systems, 'player');
      const before = { ...g.empire };
      g = dispatchSim(g, { type: 'WAIT' });
      expect(g.empire.credits - before.credits).toBe(shown.credits);
      expect(g.empire.materials - before.materials).toBe(shown.materials);
      expect(g.empire.fuel - before.fuel).toBe(shown.fuel);
    }
  });
});

describe('no-negative-resources guarantee', () => {
  it('spends are blocked when the pool is short; production keeps filling', () => {
    const g = newGame(SEED);
    const dest = g.galaxy.systems[19]; // far corner: multi-year, costly
    g.empire.fuel = 0;
    const blocked = dispatchSim(g, { type: 'TRAVEL', destinationId: dest.id });
    // Either out of range (no travel at all) or fuel-blocked — either way a
    // no-op: no time passes, no spend, fuel stays exactly 0.
    expect(blocked).toBe(g);
    expect(g.empire.fuel).toBe(0);
    const waited = dispatchSim(g, { type: 'WAIT' });
    expect(waited.empire.fuel).toBeGreaterThan(0);
  });

  it('stays non-negative across 60 mixed actions (voyages + waits)', () => {
    let g = newGame(SEED);
    g.empire.fuel = 12; // start lean
    const hw = g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;
    const near = g.galaxy.systems
      .filter((s) => s.id !== hw.id && Math.hypot(s.x - hw.x, s.y - hw.y) <= 30)
      .slice(0, 2);
    expect(near.length).toBe(2);
    for (let i = 0; i < 60; i++) {
      const dest = near[i % 2];
      const next = dispatchSim(g, { type: 'TRAVEL', destinationId: dest.id });
      g = next === g ? dispatchSim(g, { type: 'WAIT' }) : next; // blocked? wait it out
      expect(g.empire.credits).toBeGreaterThanOrEqual(0);
      expect(g.empire.materials).toBeGreaterThanOrEqual(0);
      expect(g.empire.fuel).toBeGreaterThanOrEqual(0);
    }
  });
});
