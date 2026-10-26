/**
 * C20 — tutorial engine (verify-only advance):
 *  - a step advances SOLELY on its authoritative state check; a fabricated
 *    wrong action sequence can never FAIL a step (no failure state exists)
 *  - a different valid action can never trap the player (state check, not
 *    path check)
 *  - the tutorial is a recorder, not a gate: the engine never rejects an
 *    action because of it, and advance never touches the RNG streams
 *  - skip pauses (resume re-activates at the same step)
 *  - a save/load mid-tutorial resumes the exact step
 *  - the recovery probe guides when the expected action is impossible
 */

import { describe, expect, it } from 'vitest';
import { dispatchSim, newGame } from '../src/engine/simulation';
import { gridNeighbors } from '../src/engine/galaxy';
import {
  advanceTutorial,
  resumeTutorial,
  skipTutorial,
  startTutorial,
} from '../src/engine/tutorial';
import type { GameState, TutorialStep } from '../src/engine/types';
import { loadGame, saveGame, type StorageLike } from '../src/state/persistence';

const SEED = 4242;

/**
 * A deterministic campaign plus two of its homeworld neighbors that are also
 * mutually adjacent — the detour route the no-trap test needs. (Topology
 * precondition: if a seed ever lacks such a pair, fail loudly, not silently.)
 */
function campaign() {
  const g = newGame(SEED);
  const hw = g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;
  const neigh = gridNeighbors(g.galaxy.systems, hw).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = 0; i < neigh.length; i++) {
    for (let j = i + 1; j < neigh.length; j++) {
      if (gridNeighbors(g.galaxy.systems, neigh[i]).some((n) => n.id === neigh[j].id)) {
        return { g, aId: neigh[i].id, bId: neigh[j].id };
      }
    }
  }
  throw new Error(`seed ${SEED}: no two homeworld neighbors are mutually adjacent (topology precondition)`);
}

/** Travel to a system and let the voyage resolve. */
function travelTo(s: GameState, dest: string): GameState {
  let n = dispatchSim(s, { type: 'TRAVEL', destinationId: dest });
  let guard = 0;
  while (n.flagship.travel !== null && guard++ < 80) {
    n = dispatchSim(n, { type: 'WAIT' });
  }
  return n;
}

/** Fabricated two-step tutorial: reach year 5, then leave the homeworld. */
function fakeSteps(): TutorialStep[] {
  return [
    {
      id: 'wait5',
      objective: 'Reach year 5.',
      control: 'Wait',
      verify: (s) => s.tick >= 5,
    },
    {
      id: 'leave',
      objective: 'Leave the homeworld.',
      control: 'Travel',
      verify: (s) => s.flagship.systemId !== s.galaxy.homeworldId,
    },
  ];
}

describe('C20 — verify-only advance', () => {
  it('a step advances only when its state check passes (same reference until then)', () => {
    const steps = fakeSteps();
    let s = startTutorial(newGame(SEED), 'test');
    const unchanged = advanceTutorial(s, steps);
    expect(unchanged).toBe(s); // tick 0 < 5 — no advance, no clone, no churn
    expect(unchanged.rng).toEqual(s.rng);
    expect(unchanged.narrRng).toEqual(s.narrRng);
    for (let i = 0; i < 5; i++) s = dispatchSim(s, { type: 'WAIT' });
    s = advanceTutorial(s, steps);
    expect(s.tutorial!.step).toBe(1);
    expect(s.tutorial!.completedSteps).toEqual([0]);
    // Step 2 is not yet satisfied — advance is a no-op again.
    expect(advanceTutorial(s, steps)).toBe(s);
  });

  it('a fabricated wrong action sequence can never fail a step', () => {
    const steps: TutorialStep[] = [
      { id: 'late', objective: 'x', control: null, verify: (s) => s.tick >= 50 },
    ];
    let s = startTutorial(newGame(99), 'test');
    // Ten years of "wrong" actions (waiting, building, waiting): the step
    // simply does not advance — it is never failed, lost, or reset.
    for (let i = 0; i < 10; i++) {
      s = dispatchSim(s, { type: 'WAIT' });
      s = dispatchSim(s, { type: 'BUILD', ship: 'transport' });
      s = advanceTutorial(s, steps);
      expect(s.tutorial).not.toBeNull(); // still running, no failure state
    }
    expect(s.tutorial!.step).toBe(0);
    // And the moment the state check passes, the step was never lost.
    for (let i = 0; i < 45; i++) {
      s = dispatchSim(s, { type: 'WAIT' });
      s = advanceTutorial(s, steps);
    }
    expect(s.tutorial!.step).toBe(1);
  });

  it('alternate valid actions do not trap: the check is on state, not path', () => {
    const { aId, bId } = campaign();
    const steps: TutorialStep[] = [
      {
        id: 'goto-a',
        objective: `Get to ${aId}.`,
        control: 'Travel',
        verify: (s) => s.flagship.systemId === aId,
      },
    ];
    const run = (detour: boolean) => {
      let s = startTutorial(newGame(SEED), 'test');
      if (detour) {
        // A different valid route: somewhere else first, then the target.
        s = travelTo(s, bId);
        s = advanceTutorial(s, steps);
        expect(s.tutorial!.step).toBe(0); // en route elsewhere — no false advance
        s = travelTo(s, aId);
      } else {
        s = travelTo(s, aId);
      }
      s = advanceTutorial(s, steps);
      expect(s.tutorial!.step).toBe(1);
      expect(s.tutorial!.completedSteps).toEqual([0]);
    };
    run(false); // direct
    run(true); // detour — same end state, same advance
  });

  it('no engine lock: ordinary actions still fully simulate while the tutorial runs', () => {
    const g = newGame(SEED);
    const hw = g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;
    // An adjacent world with a planet (topology precondition: the generator
    // guarantees ≥ 2 viable adjacent expansion targets).
    const target = gridNeighbors(g.galaxy.systems, hw)
      .filter((s) => s.planet !== null && s.ownerId !== 'player')
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    expect(target).toBeDefined();
    let s = startTutorial(g, 'test');
    // Travel there, then attack — "wrong" for any conceivable first lesson —
    // and the engine still simulates it exactly as in a normal campaign
    // (attack is local: the flagship must be in the target system).
    s = travelTo(s, target.id);
    const tickBefore = s.tick;
    const battlesBefore = s.stats.battles;
    s = dispatchSim(s, { type: 'ATTACK', targetId: target.id, stance: 'aggressive' });
    expect(s.tutorial).not.toBeNull(); // tutorial untouched by the action
    expect(s.tick).toBeGreaterThan(tickBefore); // time advanced: it was simulated
    expect(s.stats.battles).toBe(battlesBefore + 1); // and the battle really happened
    // Waiting works while the tutorial runs, and advances the step when due.
    const steps = fakeSteps();
    for (let i = 0; i < 6; i++) {
      s = dispatchSim(s, { type: 'WAIT' });
      s = advanceTutorial(s, steps);
    }
    expect(s.tutorial!.step).toBeGreaterThanOrEqual(1);
  });
});

describe('C20 — skip / resume', () => {
  it('skip pauses the tutorial; resume re-activates it at the same step', () => {
    const steps = fakeSteps();
    let s = startTutorial(newGame(11), 'test');
    s = dispatchSim(s, { type: 'WAIT' });
    s = dispatchSim(s, { type: 'WAIT' });
    s = advanceTutorial(s, steps); // tick 2 — still step 0
    s = skipTutorial(s);
    expect(s.tutorial!.skipped).toBe(true);
    // While skipped, even a satisfied check does not advance.
    for (let i = 0; i < 5; i++) {
      s = dispatchSim(s, { type: 'WAIT' });
      s = advanceTutorial(s, steps);
    }
    expect(s.tutorial!.step).toBe(0);
    expect(skipTutorial(s)).toBe(s); // skipping twice is a no-op
    s = resumeTutorial(s);
    expect(s.tutorial!.skipped).toBe(false);
    s = advanceTutorial(s, steps); // tick >= 5 — the step advances again
    expect(s.tutorial!.step).toBe(1);
  });

  it('start is idempotent while a tutorial is active', () => {
    const s = startTutorial(newGame(12), 'test');
    expect(startTutorial(s, 'other')).toBe(s);
    expect(s.tutorial!.scenario).toBe('test');
  });
});

describe('C20 — save / resume', () => {
  function fakeStorage(): StorageLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  }

  it('a save/load mid-tutorial resumes the exact step', () => {
    const steps = fakeSteps();
    const { aId } = campaign();
    let s = startTutorial(newGame(SEED), 'test');
    for (let i = 0; i < 5; i++) s = dispatchSim(s, { type: 'WAIT' });
    s = advanceTutorial(s, steps); // step 0 → 1
    expect(s.tutorial!.step).toBe(1);

    const storage = fakeStorage();
    saveGame(s, storage);
    const loaded = loadGame(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.tutorial).toEqual(s.tutorial); // the exact step, milestone intact

    // The machine keeps working from exactly that step: complete step 2.
    let r = travelTo(loaded!, aId);
    r = advanceTutorial(r, steps);
    expect(r.tutorial!.step).toBe(2);
    expect(r.tutorial!.completedSteps).toEqual([0, 1]);
  });

  it('the tutorial state is plain JSON (milestones survive serialization)', () => {
    const s = startTutorial(newGame(SEED), 'test');
    const round = JSON.parse(JSON.stringify(s.tutorial));
    expect(round).toEqual(s.tutorial);
    expect(typeof round.step).toBe('number');
    expect(Array.isArray(round.completedSteps)).toBe(true);
  });
});

describe('C20 — recovery probe', () => {
  it('guides when the expected action is impossible, and is silent otherwise', () => {
    const { aId } = campaign();
    const step: TutorialStep = {
      id: 'leave',
      objective: 'Leave the homeworld.',
      control: 'Travel',
      verify: (s) => s.flagship.systemId !== s.galaxy.homeworldId,
      recovery: (s) =>
        s.flagship.travel === null && s.flagship.systemId === s.galaxy.homeworldId
          ? 'The flagship is still at the homeworld — set a course to a neighboring system.'
          : null,
    };
    let s = startTutorial(newGame(SEED), 'test');
    expect(step.verify(s)).toBe(false);
    expect(step.recovery!(s)).not.toBeNull(); // idle at the homeworld — guidance
    // Adjacent travel completes within one tick: no observable in-transit
    // state — the probe is moot the moment the flagship is no longer there.
    s = dispatchSim(s, { type: 'TRAVEL', destinationId: aId });
    expect(step.recovery!(s)).toBeNull();
    s = travelTo(s, aId);
    expect(step.verify(s)).toBe(true); // arrived — the step is done
  });
});
