import { describe, expect, it } from 'vitest';
import { createFixtureGalaxy, generateGalaxy } from '../src/engine/galaxy';
import { dispatchSim, newGame, runYears } from '../src/engine/simulation';
import { criticalWindow, supernovaState } from '../src/engine/supernova';
import { evaluateWinLose } from '../src/engine/victory';
import type { GameState } from '../src/engine/types';

/**
 * C15 acceptance:
 *  - timing deterministic (tested)
 *  - warnings precede detonation by ≥ the shown window minus 1 year
 *    (window always a range, no false precision)
 *  - homeworld never a candidate (tested)
 *  - victory still achievable with destroyed systems excluded (tested)
 */

function fixtureState(): GameState {
  const s = newGame(4242);
  // Deterministic 8-system fixture: S07 is the supernova candidate (55 / rate 5).
  s.galaxy = createFixtureGalaxy();
  s.flagship.systemId = s.galaxy.homeworldId;
  s.flagship.travel = null;
  return s;
}

describe('C15 seeding', () => {
  it('is deterministic: same seed → same candidates, rates, and trajectories', () => {
    const a = generateGalaxy(777);
    const b = generateGalaxy(777);
    const pick = (g: typeof a) =>
      g.systems.map((s) => [s.id, s.supernovaCandidate, s.instabilityRate, s.instability]);
    expect(pick(a)).toEqual(pick(b));

    // Whole-tick determinism through the stars stage.
    const mk = () => {
      const s = newGame(999);
      s.flagship.systemId = s.galaxy.homeworldId;
      s.flagship.travel = null;
      return s;
    };
    const seq = (s: GameState) => {
      const out: number[][] = [];
      for (let i = 0; i < 40; i++) {
        s = runYears(s, 1);
        out.push(s.galaxy.systems.map((x) => x.instability));
      }
      return out;
    };
    expect(seq(mk())).toEqual(seq(mk()));
  });

  it('respects the frequency table (zero/low/normal = 0 / 2–3 / 3–5)', () => {
    const counts = (seed: number, freq: 'zero' | 'low' | 'normal') =>
      generateGalaxy(seed, { supernovaFrequency: freq }).systems.filter(
        (s) => s.supernovaCandidate,
      ).length;
    expect(counts(5, 'zero')).toBe(0);
    const low = counts(5, 'low');
    expect(low).toBeGreaterThanOrEqual(2);
    expect(low).toBeLessThanOrEqual(3);
    const normal = counts(5, 'normal');
    expect(normal).toBeGreaterThanOrEqual(3);
    expect(normal).toBeLessThanOrEqual(5);
  });

  it('the homeworld is never a candidate (across seeds and frequencies)', () => {
    for (const seed of [1, 2, 3, 42, 4242, 987654]) {
      for (const freq of ['zero', 'low', 'normal'] as const) {
        const g = generateGalaxy(seed, { supernovaFrequency: freq });
        const home = g.systems.find((s) => s.id === g.homeworldId)!;
        expect(home.supernovaCandidate).toBe(false);
        expect(home.instabilityRate).toBe(0);
      }
    }
  });
});

describe('C15 pipeline', () => {
  it('advances only candidates, transitions state, and logs each warning', () => {
    let s = fixtureState();
    // Fixture: S07 is a candidate (instability 55, rate 5); S04 is not.
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    const s04 = () => s.galaxy.systems.find((x) => x.id === 'S04')!;
    expect(s07().supernovaCandidate).toBe(true);
    expect(s07().instability).toBe(55);

    s = runYears(s, 1); // 55 → 60, still anomalous
    expect(s07().instability).toBe(60);
    expect(s04().instability).toBe(0); // non-candidates never move

    s = runYears(s, 3); // 60 → 75 = CRITICAL (tick 4)
    expect(s07().instability).toBe(75);
    expect(supernovaState(s07())).toBe('critical');
    expect(
      s.log.some((l) => l.kind === 'warning' && l.text.includes('CRITICAL')),
    ).toBe(true);
  });

  it('logs the anomalous alert when a stable star crosses 50', () => {
    let s = fixtureState();
    // White-box a fresh candidate that starts stable.
    const s01 = s.galaxy.systems.find((x) => x.id === 'S01')!;
    s01.supernovaCandidate = true;
    s01.instability = 48;
    s01.instabilityRate = 5;
    s = runYears(s, 1); // 48 → 53 = anomalous
    const fresh01 = s.galaxy.systems.find((x) => x.id === 'S01')!; // new state — re-fetch
    expect(supernovaState(fresh01)).toBe('anomalous');
    expect(
      s.log.some((l) => l.kind === 'event' && l.text.includes('anomalies')),
    ).toBe(true);
  });

  it('the window is a range, and the warning precedes detonation by ≥ window−1', () => {
    let s = fixtureState();
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    // Advance to the critical tick.
    while (supernovaState(s07()) !== 'critical') s = runYears(s, 1);
    const critTick = s.tick;
    const [lo, hi] = criticalWindow(s07(), false);
    expect(lo).toBeLessThanOrEqual(hi); // a range, not a point
    expect(hi).toBeLessThanOrEqual(6); // no false precision past the band
    // Run to detonation.
    while (s07().instability < 100) s = runYears(s, 1);
    const detTick = s.tick;
    expect(detTick - critTick).toBeGreaterThanOrEqual(hi - 1);
    expect(supernovaState(s07())).toBe('supernova');
  });

  it('scouting (local presence) narrows the window from below', () => {
    let s = fixtureState();
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    while (supernovaState(s07()) !== 'critical') s = runYears(s, 1);
    const wide = criticalWindow(s07(), false);
    // Dock the flagship at S07 → scouted.
    s.flagship.systemId = 'S07';
    s.flagship.travel = null;
    const narrow = criticalWindow(s07(), true);
    expect(narrow[0]).toBeGreaterThanOrEqual(wide[0]);
    expect(narrow[1]).toBeLessThanOrEqual(wide[1]);
    expect(narrow[1] - narrow[0]).toBeLessThanOrEqual(wide[1] - wide[0]);
  });
});

describe('C15 victory exclusion', () => {
  it('a destroyed (rival) system is excluded from conquest-victory', () => {
    const mk = (destroyed: boolean) => {
      const s = fixtureState();
      for (const t of s.galaxy.systems) {
        t.ownerId = 'player';
        t.occupation = 'integrated';
        if (t.planet) {
          t.planet.integration = 100;
          t.planet.stability = 100;
        }
      }
      // S05: a rival world that is (or is not) destroyed.
      const s05 = s.galaxy.systems.find((x) => x.id === 'S05')!;
      s05.ownerId = 'rival-0';
      s05.destroyed = destroyed;
      evaluateWinLose(s);
      return s.status;
    };
    // Intact rival world blocks victory…
    expect(mk(false)).toBe('active');
    // …but the same world, destroyed, is excluded → victory is achievable.
    expect(mk(true)).toBe('victory');
  });
});

describe('C16 evacuation & detonation (Gate M4)', () => {
  it('a warned supernova occurs in a live game without corrupting state', () => {
    let s = fixtureState();
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    while (supernovaState(s07()) !== 'critical') s = runYears(s, 1);
    const warned = s.log.some((l) => l.kind === 'warning' && l.text.includes('CRITICAL'));
    while (!s07().destroyed) s = runYears(s, 1);
    expect(warned).toBe(true);
    expect(s07().planet).toBeNull(); // planet destroyed
    expect(s07().ownerId).toBeNull(); // remnant belongs to no one
    expect(s07().defense).toBe(0); // production permanently lost
    expect(s.log.some((l) => l.text.includes('goes supernova'))).toBe(true); // factual report
    for (const t of s.galaxy.systems) { // no corruption anywhere
      expect(Number.isFinite(t.instability)).toBe(true);
      expect(Number.isFinite(t.defense)).toBe(true);
    }
    expect(['active', 'victory', 'defeat']).toContain(s.status);
  });

  it('victory is still possible after a detonation', () => {
    let s = fixtureState();
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    while (!s07().destroyed) s = runYears(s, 1); // let it blow
    for (const t of s.galaxy.systems) {
      if (t.destroyed || t.planet === null) continue;
      t.ownerId = 'player';
      t.occupation = 'integrated';
      t.planet.integration = 100;
      t.planet.stability = 100;
    }
    evaluateWinLose(s);
    expect(s.status).toBe('victory');
  });

  it('save/load across the detonation is deep-equal', () => {
    let s = fixtureState();
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    while (s07().instability < 100) s = runYears(s, 1); // armed, not yet detonated
    expect(s07().destroyed).toBe(false);
    const reloaded = JSON.parse(JSON.stringify(s)) as GameState; // the save round-trip
    const a = runYears(reloaded, 3);
    const b = runYears(s, 3);
    expect(a).toEqual(b);
  });

  it('evacuation is strictly better than standing still', () => {
    const mk = (orderEvacuation: boolean) => {
      let s = fixtureState();
      s.empire.credits = 300; // fund the emergency
      // White-box: S01 is a player world whose star is about to go.
      const s01 = s.galaxy.systems.find((x) => x.id === 'S01')!;
      s01.ownerId = 'player';
      s01.supernovaCandidate = true;
      s01.instability = 95;
      s01.instabilityRate = 5;
      // Station a support fleet there.
      s = dispatchSim(s, { type: 'COMMISSION' });
      const f = s.supports[0];
      f.systemId = 'S01';
      f.supportState = 'defending';
      f.mission = { type: 'defend', targetId: 'S01' };
      if (orderEvacuation) s = dispatchSim(s, { type: 'EVACUATE', systemId: 'S01' });
      s = runYears(s, 3); // armed → evacuation completes → detonation
      return s;
    };
    const withEvac = mk(true);
    const without = mk(false);
    const s01a = withEvac.galaxy.systems.find((x) => x.id === 'S01')!;
    expect(s01a.destroyed).toBe(true); // the star still goes
    // Ships: withdrawn (alive) vs destroyed (gone).
    expect(withEvac.supports).toHaveLength(1);
    expect(without.supports).toHaveLength(0);
    // People: 60% of S01's 6M reached the capital (round(3.6) = 4M).
    const homeA = withEvac.galaxy.systems.find((x) => x.id === 'S04')!;
    const homeB = without.galaxy.systems.find((x) => x.id === 'S04')!;
    expect(homeA.planet!.population).toBe(homeB.planet!.population + 4);
  });
});

describe('C18 — survived-supernovas stat (core §12)', () => {
  it('each detonation during an active campaign increments stats.supernovas', () => {
    let s = fixtureState();
    const before = s.stats.supernovas;
    const s07 = () => s.galaxy.systems.find((x) => x.id === 'S07')!;
    while (!s07().destroyed) s = runYears(s, 1);
    expect(s.stats.supernovas).toBe(before + 1);
  });
});
