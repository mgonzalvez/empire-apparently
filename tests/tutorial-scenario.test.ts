/**
 * C21 — tutorial scenario acceptance (CHUNKS.md C21):
 *  - the scenario loads identically every time (and round-trips JSON)
 *  - the scripted detonation destroys nothing the player needs
 *  - zero rival or event interference across the full scenario window
 *  - a save/load mid-scenario resumes identically (and stays identical)
 *  - every system is within one jump of the homeworld (range tuning)
 *  - the temporary support fleet is a standard, mission-ready fleet
 */

import { describe, expect, it } from 'vitest';
import { newGame, runYears } from '../src/engine/simulation';
import { supernovaState } from '../src/engine/supernova';
import type { GameState, System } from '../src/engine/types';
import {
  createTutorialGame,
  TUTORIAL_SUPERNOVA_TICKS,
  TUTORIAL_SYSTEMS,
} from '../src/data/tutorial/scenario';
import { MAX_JUMP_RANGE, SUPPORT } from '../src/data/balance';
import { loadGame, saveGame, type StorageLike } from '../src/state/persistence';

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const byId = (g: GameState, id: string): System =>
  g.galaxy.systems.find((s) => s.id === id)!;

/** Snapshot of the ownership map (who owns what) — for the no-interference check. */
function ownershipMap(g: GameState): Record<string, string | null> {
  return Object.fromEntries(g.galaxy.systems.map((s) => [s.id, s.ownerId]));
}

describe('C21 — loads identically every time', () => {
  it('two factory calls produce identical state', () => {
    expect(createTutorialGame()).toEqual(createTutorialGame());
  });

  it('the full state round-trips JSON (save-safe)', () => {
    const g = createTutorialGame();
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('is a valid campaign the engine accepts (a normal tick runs)', () => {
    const g = runYears(createTutorialGame(), 1);
    expect(g.tick).toBe(1);
    expect(g.status).toBe('active');
  });
});

describe('C21 — the scripted detonation loses nothing of value', () => {
  const t = TUTORIAL_SUPERNOVA_TICKS;

  it('follows the exact schedule (14 → 17 → 20 → 21)', () => {
    let g = createTutorialGame();
    g = runYears(g, t.anomalousAt - 1); // tick 13
    expect(supernovaState(byId(g, TUTORIAL_SYSTEMS.anomaly))).toBe('stable');
    g = runYears(g, 1); // tick 14
    expect(supernovaState(byId(g, TUTORIAL_SYSTEMS.anomaly))).toBe('anomalous');
    expect(g.events.some((e) => e.type === 'supernova.anomalous')).toBe(true);
    g = runYears(g, t.criticalAt - t.anomalousAt); // tick 17
    expect(supernovaState(byId(g, TUTORIAL_SYSTEMS.anomaly))).toBe('critical');
    expect(g.events.some((e) => e.type === 'supernova.critical')).toBe(true);
    g = runYears(g, t.armedAt - t.criticalAt); // tick 20 — armed, warning visible
    expect(supernovaState(byId(g, TUTORIAL_SYSTEMS.anomaly))).toBe('supernova');
    expect(
      g.log.some((l) => l.tick === t.armedAt && l.text.includes('on the edge')),
    ).toBe(true);
    g = runYears(g, 1); // tick 21 — detonation
    expect(byId(g, TUTORIAL_SYSTEMS.anomaly).destroyed).toBe(true);
    expect(g.stats.supernovas).toBe(1);
    expect(g.events.some((e) => e.type === 'supernova.detonation')).toBe(true);
  });

  it('destroys nothing the player needs', () => {
    const g = runYears(createTutorialGame(), t.detonatesAt);
    // Every other system still has its planet and still exists.
    for (const id of [
      TUTORIAL_SYSTEMS.homeworld,
      TUTORIAL_SYSTEMS.easyA,
      TUTORIAL_SYSTEMS.rival,
      TUTORIAL_SYSTEMS.easyB,
      TUTORIAL_SYSTEMS.finale,
      TUTORIAL_SYSTEMS.empty,
    ]) {
      const sys = byId(g, id);
      expect(sys.destroyed).toBe(false);
      if (sys.planet) expect(sys.planet.population).toBeGreaterThan(0);
    }
    // The player's assets are intact.
    expect(g.flagship.hull).toBe(100);
    expect(g.supports.length).toBe(1);
    expect(g.status).toBe('active');
    // Only the uninhabited star is gone.
    const destroyed = g.galaxy.systems.filter((s) => s.destroyed);
    expect(destroyed.map((s) => s.id)).toEqual([TUTORIAL_SYSTEMS.anomaly]);
  });
});

describe('C21 — zero rival or event interference', () => {
  it('runs 25 clean ticks: the rivals never act, nothing random happens', () => {
    const g0 = createTutorialGame();
    const before = {
      ownership: ownershipMap(g0),
      rivalFleet: g0.galaxy.factions.find((f) => f.kind === 'rival')!.fleet,
      annex: JSON.parse(JSON.stringify(byId(g0, TUTORIAL_SYSTEMS.rival))),
    };
    const g = runYears(g0, 25); // past the detonation
    // No rival action of any kind.
    expect(g.galaxy.factions.find((f) => f.kind === 'rival')!.fleet).toBe(before.rivalFleet);
    expect(JSON.parse(JSON.stringify(byId(g, TUTORIAL_SYSTEMS.rival)))).toEqual(before.annex);
    expect(ownershipMap(g)).toEqual(before.ownership); // no expansion, no theft
    expect(g.stats.battles).toBe(0);
    expect(g.stats.wins).toBe(0);
    expect(g.stats.losses).toBe(0);
    // No rival events in the typed journal…
    expect(g.events.some((e) => e.type.startsWith('rival.'))).toBe(false);
    // …and none in the prose log either.
    expect(g.log.every((l) => !l.text.includes('The Patient Union'))).toBe(true);
    // And no narrative events at all (the engine has none yet — C29 must keep it that way here).
    expect(g.narrative.resolvedIds).toEqual([]);
  });
});

describe('C21 — save/load mid-scenario resumes identically', () => {
  it('mid-anomaly save → load → identical, and stays identical forward', () => {
    let g = createTutorialGame();
    g = runYears(g, 15); // anomaly active, detonation pending
    const storage = fakeStorage();
    saveGame(g, storage);
    const loaded = loadGame(storage);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(g); // the exact state, including the script

    // And the futures match: run both forward the same amount.
    expect(runYears(loaded!, 8)).toEqual(runYears(g, 8));
  });
});

describe('C21 — the region is tuned so every step is possible', () => {
  it('every system is within one jump of the homeworld', () => {
    const g = createTutorialGame();
    const hw = byId(g, TUTORIAL_SYSTEMS.homeworld);
    for (const s of g.galaxy.systems) {
      const dist = Math.hypot(s.x - hw.x, s.y - hw.y);
      expect(dist, `${s.id} is ${dist.toFixed(1)} units out`).toBeLessThanOrEqual(MAX_JUMP_RANGE);
    }
  });

  it('the temporary fleet is a standard support fleet, ready for delegation', () => {
    const g = createTutorialGame();
    expect(g.supports.length).toBe(1);
    const wing = g.supports[0];
    expect(wing.ships).toEqual(SUPPORT.startingShips);
    expect(wing.mission).toBeNull(); // unassigned — C22 step 8 delegates it
    expect(wing.homeId).toBe(TUTORIAL_SYSTEMS.homeworld);
    expect(wing.systemId).toBe(TUTORIAL_SYSTEMS.homeworld);
    expect(wing.supportState).toBe('patrolling');
  });

  it('the rival is beatable and the finale is the hardest world', () => {
    const g = createTutorialGame();
    const defenses = g.galaxy.systems
      .filter((s) => s.planet !== null)
      .map((s) => [s.id, s.defense] as const);
    const finale = defenses.find(([id]) => id === TUTORIAL_SYSTEMS.finale)![1];
    for (const [id, d] of defenses) {
      if (id !== TUTORIAL_SYSTEMS.finale) expect(finale).toBeGreaterThan(d);
    }
    // The weak rival's colony is below even the easy independents' finale math —
    // i.e. trivially beatable by the starting fleet.
    expect(byId(g, TUTORIAL_SYSTEMS.rival).defense).toBeLessThan(finale);
  });

  it('normal campaigns are unaffected (no freeze, no script, no loan)', () => {
    const g = newGame(4242);
    expect(g.rivalsFrozen).toBe(false);
    expect(g.scriptedSupernova).toBeNull();
    expect(g.supports).toEqual([]);
  });
});
