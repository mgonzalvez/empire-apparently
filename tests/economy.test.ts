import { describe, expect, it } from 'vitest';
import { DEV, ECON } from '../src/data/balance';
import {
  developmentCost,
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
  integration: 0,
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
  it('equals the table sum over owned planets, net of automatic development', () => {
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

    // C9: the development stage may pay from the pool AFTER income — the
    // delta is income minus whatever development the tick advanced.
    const homeBefore = g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;
    const before = { ...g.empire };
    const next = dispatchSim(g, { type: 'WAIT' });
    const homeAfter = next.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;
    const devSpend =
      homeAfter.planet!.development > homeBefore.planet!.development
        ? developmentCost(homeBefore.planet!.development)!
        : null;
    expect(next.empire.credits - before.credits).toBe(exp.credits - (devSpend?.credits ?? 0));
    expect(next.empire.materials - before.materials).toBe(exp.materials - (devSpend?.materials ?? 0));
    expect(next.empire.fuel - before.fuel).toBe(exp.fuel);
  });

  it('the displayed income source and the engine agree every year (C5 acceptance)', () => {
    // EmpireBar renders empireIncome(state); the engine applies the same
    // function in the resources stage; the development stage then spends
    // from the pool. Assert the two cannot drift (delta = shown − dev spend).
    let g = newGame(SEED);
    for (let i = 0; i < 10; i++) {
      const shown = empireIncome(g.galaxy.systems, 'player');
      const devsBefore = g.galaxy.systems
        .filter((s) => s.ownerId === 'player' && s.planet)
        .map((s) => s.planet!.development);
      const before = { ...g.empire };
      g = dispatchSim(g, { type: 'WAIT' });
      let devC = 0;
      let devM = 0;
      g.galaxy.systems
        .filter((s) => s.ownerId === 'player' && s.planet)
        .forEach((s, i) => {
          if (s.planet!.development > devsBefore[i]) {
            const c = developmentCost(devsBefore[i])!;
            devC += c.credits;
            devM += c.materials;
          }
        });
      expect(g.empire.credits - before.credits).toBe(shown.credits - devC);
      expect(g.empire.materials - before.materials).toBe(shown.materials - devM);
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

// ── C9: development & specialization ────────────────────────────────────

import type { GameState, Resources } from '../src/engine/types';

/** Isolated single-world galaxy: only the given systems exist; no rival
 *  systems to expand into; the dummy homeworld id prevents accidental
 *  victory (the homeworld-id integration shortcut never matches). */
const iso = (systems: System[], pool: Resources): GameState => {
  const g = newGame(SEED);
  g.galaxy = {
    seed: SEED,
    systems,
    factions: [
      { id: 'player', name: 'P', kind: 'player', color: '#fff' },
      { id: 'rival-0', name: 'R', kind: 'rival', color: '#000' },
    ],
    homeworldId: 'HOME-DUMMY',
    capitalIds: { player: systems[0].id },
  };
  g.empire = pool;
  g.flagship.systemId = systems[0].id;
  g.flagship.travel = null;
  return g;
};

describe('development (C9)', () => {
  it('developmentCost matches the documented transparent table', () => {
    expect(DEV.maxDevelopment).toBe(5);
    expect(developmentCost(1)).toEqual({ credits: 20, materials: 10 });
    expect(developmentCost(2)).toEqual({ credits: 40, materials: 20 });
    expect(developmentCost(3)).toEqual({ credits: 60, materials: 30 });
    expect(developmentCost(4)).toEqual({ credits: 80, materials: 40 });
    expect(developmentCost(5)).toBeNull();
    expect(developmentCost(0)).toBeNull();
  });

  it('auto-advances a player world in the same tick, after income', () => {
    // mining d1: income 1c/2m/2f. Pool 19c/10m → 20c/12m after income →
    // pays the I→II cost (20/10): development 2, pool 0c/2m/2f.
    const g = iso([sys('W', 'mining', 1, 'player')], { credits: 19, materials: 10, fuel: 0 });
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.galaxy.systems[0].planet!.development).toBe(2);
    expect(next.empire.credits).toBe(0);
    expect(next.empire.materials).toBe(2);
    expect(next.empire.fuel).toBe(2);
    expect(next.log.some((l) => l.text.includes('develops to level II'))).toBe(true);
    // Deterministic: no sim RNG consumed.
    expect(next.rng).toEqual(g.rng);
  });

  it('caps at development 5 and never spends past it', () => {
    const g = iso([sys('W', 'balanced', 5, 'player')], { credits: 500, materials: 500, fuel: 0 });
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.galaxy.systems[0].planet!.development).toBe(5);
    expect(next.empire.credits).toBe(500 + 2 * 5); // income only
    expect(next.empire.materials).toBe(500 + 2 * 5);
    expect(next.log.some((l) => l.text.includes('develops'))).toBe(false);
  });

  it('simply waits (no negative pool) when it cannot pay', () => {
    // economic d1: income 3c. Pool 16c → 19c < 20 → no advance.
    const g = iso([sys('W', 'economic', 1, 'player')], { credits: 16, materials: 100, fuel: 0 });
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.galaxy.systems[0].planet!.development).toBe(1);
    expect(next.empire.credits).toBe(19);
    expect(next.empire.materials).toBeGreaterThanOrEqual(0);
  });

  it('advances one level per year, canonical order, first come first served', () => {
    // Two economic d1 worlds: pool 20c/20m + income 6c/2m = 26c/22m.
    // World A pays I→II (20/10) → 6c/12m; world B cannot.
    const g = iso(
      [sys('A', 'economic', 1, 'player'), sys('B', 'economic', 1, 'player')],
      { credits: 20, materials: 20, fuel: 0 },
    );
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.galaxy.systems[0].planet!.development).toBe(2);
    expect(next.galaxy.systems[1].planet!.development).toBe(1);
    expect(next.empire.credits).toBe(6);
    expect(next.empire.materials).toBe(12);
  });

  it('never develops non-player, uninhabited, or destroyed worlds', () => {
    const g = iso(
      [
        sys('R', 'economic', 1, 'rival-0'),
        { ...sys('U', 'economic', 1, 'player'), planet: null },
        { ...sys('X', 'economic', 1, 'player'), destroyed: true },
      ],
      { credits: 1000, materials: 1000, fuel: 0 },
    );
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.galaxy.systems[0].planet!.development).toBe(1);
    expect(next.empire.credits).toBe(1000); // nothing developed → nothing paid
  });
});

describe('specialization change (C9)', () => {
  it('is instant (0 ticks, no RNG) and changes next-year income per the table', () => {
    const g = iso([sys('W', 'mining', 2, 'player')], { credits: 0, materials: 0, fuel: 0 });
    const next = dispatchSim(g, { type: 'SPECIALIZE', systemId: 'W', specialization: 'economic' });
    expect(next.tick).toBe(g.tick);
    expect(next.rng).toEqual(g.rng);
    expect(next.galaxy.systems[0].planet!.specialization).toBe('economic');
    // economic × dev 2 = 6c/2m/2f per year — acceptance: income per table.
    expect(productionOf(next.galaxy.systems[0].planet!)).toEqual({
      credits: 6, materials: 2, fuel: 2,
    });
    expect(empireIncome(next.galaxy.systems)).toEqual({
      credits: 6, materials: 2, fuel: 2,
    });
    expect(next.log.some((l) => l.text.includes('re-zoned as economic'))).toBe(true);
  });

  it('is a no-op on non-player worlds and uninhabited stars', () => {
    const g = iso(
      [
        sys('R', 'mining', 2, 'rival-0'),
        { ...sys('U', 'economic', 1, 'player'), planet: null },
      ],
      { credits: 0, materials: 0, fuel: 0 },
    );
    expect(dispatchSim(g, { type: 'SPECIALIZE', systemId: 'R', specialization: 'economic' })).toBe(g);
    expect(dispatchSim(g, { type: 'SPECIALIZE', systemId: 'U', specialization: 'economic' })).toBe(g);
  });

  it('is a no-op when setting the current specialization', () => {
    const g = iso([sys('W', 'mining', 2, 'player')], { credits: 0, materials: 0, fuel: 0 });
    expect(dispatchSim(g, { type: 'SPECIALIZE', systemId: 'W', specialization: 'mining' })).toBe(g);
  });
});
