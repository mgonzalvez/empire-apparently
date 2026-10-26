/**
 * C17 — save/resume contract: autosave on every game-state change,
 * "Resume Previous Mistake" restores exactly, terminal campaigns are not
 * resumable, and corrupt saves yield no resume (never a crash).
 *
 * The default storage in node is the persistence module's in-memory
 * fallback — good enough to prove the round-trip, isolated per test.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch, getState } from '../src/state/gameStore';
import {
  SAVE_KEY,
  clearSave,
  hasSave,
  loadGame,
  validateSave,
  type StorageLike,
} from '../src/state/persistence';
import { newGame } from '../src/engine/simulation';

function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

beforeEach(() => {
  clearSave(); // the session's default storage
  dispatch({ type: 'MENU' });
});

describe('persistence — autosave & resume (C17)', () => {
  it('a new campaign is saved immediately; resume restores exactly', () => {
    dispatch({ type: 'NEW_GAME', seed: 777, supernovaFrequency: 'low', advisor: 'mort' });
    const live = getState().game!;
    expect(hasSave()).toBe(true);
    // "Reload": the in-memory state is gone, only the persisted save remains.
    dispatch({ type: 'MENU' });
    expect(getState().game).toBeNull();
    const saved = loadGame();
    expect(saved).not.toBeNull();
    dispatch({ type: 'LOAD', state: saved! });
    expect(getState().game).toEqual(live);
  });

  it('autosave follows a progressing campaign; resume restores the exact tick', () => {
    dispatch({ type: 'NEW_GAME', seed: 777 });
    dispatch({ type: 'WAIT' });
    dispatch({ type: 'WAIT' });
    dispatch({ type: 'SELECT_SYSTEM', systemId: 'S05' }); // view-only: no new write
    const live = getState().game!;
    expect(live.tick).toBeGreaterThanOrEqual(2);

    const saved = loadGame();
    dispatch({ type: 'MENU' }); // the save must survive returning to the title
    expect(hasSave()).toBe(true);
    dispatch({ type: 'LOAD', state: saved! });

    const resumed = getState().game!;
    expect(resumed).toEqual(live); // every field, rngs, log, galaxy — exact
    expect(resumed.seed).toBe(live.seed);
    expect(resumed.tick).toBe(live.tick);
    expect(resumed.rng).toEqual(live.rng);
    expect(resumed.narrRng).toEqual(live.narrRng);
  });

  it('a new game replaces the previous save (no stale resume)', () => {
    dispatch({ type: 'NEW_GAME', seed: 1 });
    dispatch({ type: 'WAIT' });
    dispatch({ type: 'NEW_GAME', seed: 2 });
    expect(loadGame()!.seed).toBe(2);
  });

  it('a finished mandate clears the save — Resume is never offered for a dead campaign', () => {
    dispatch({ type: 'NEW_GAME', seed: 11 });
    let g = getState().game!;
    while (g.status === 'active') {
      dispatch({ type: 'WAIT' });
      g = getState().game!;
    }
    expect(g.status).not.toBe('active'); // defeat (deadline or wipe) — terminal
    expect(hasSave()).toBe(false);
  });

  it('resuming into a terminal campaign is impossible (nothing saved to restore)', () => {
    dispatch({ type: 'NEW_GAME', seed: 11 });
    let g = getState().game!;
    while (g.status === 'active') {
      dispatch({ type: 'WAIT' });
      g = getState().game!;
    }
    dispatch({ type: 'MENU' });
    expect(hasSave()).toBe(false); // the title screen shows no resume button
  });
});

describe('persistence — setup options are real (C17)', () => {
  it('NEW_GAME honors seed, advisor, and supernova frequency', () => {
    dispatch({ type: 'NEW_GAME', seed: 4242, advisor: 'mort', supernovaFrequency: 'normal' });
    const g = getState().game!;
    expect(g.seed).toBe(4242);
    expect(g.dialogue.advisor).toBe('mort');
    expect(g.settings.advisor).toBe('mort');
    expect(g.settings.supernovaFreq).toBe('normal');
    const candidates = g.galaxy.systems.filter((s) => s.supernovaCandidate).length;
    expect(candidates).toBeGreaterThanOrEqual(3); // normal = 3..5 (balance.ts)
    expect(candidates).toBeLessThanOrEqual(5);
  });

  it('zero frequency produces no candidates', () => {
    dispatch({ type: 'NEW_GAME', seed: 9, supernovaFrequency: 'zero' });
    const g = getState().game!;
    expect(g.galaxy.systems.filter((s) => s.supernovaCandidate)).toHaveLength(0);
  });

  it('the engine falls back to M.O.R.T. for an unknown advisor id', () => {
    const g = newGame(5, { advisor: 'nope' as never });
    expect(g.dialogue.advisor).toBe('mort');
    expect(g.settings.advisor).toBe('mort');
  });
});

describe('persistence — validation (C17 minimal; C35 extends)', () => {
  it('round-trips a valid save through an isolated storage', () => {
    const storage = memoryStorage();
    const state = newGame(5);
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    const loaded = loadGame(storage);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(state);
  });

  it('absent, unparseable, and structurally invalid saves all yield null (no crash)', () => {
    const storage = memoryStorage();
    expect(loadGame(storage)).toBeNull();

    storage.setItem(SAVE_KEY, 'not json{');
    expect(loadGame(storage)).toBeNull();

    const state = newGame(5);
    const bad = { ...state, v: 2 }; // unknown version → reject (migration is C35)
    storage.setItem(SAVE_KEY, JSON.stringify(bad));
    expect(loadGame(storage)).toBeNull();

    const noFlagship = { ...state, flagship: null };
    storage.setItem(SAVE_KEY, JSON.stringify(noFlagship));
    expect(loadGame(storage)).toBeNull();

    const badRng = { ...state, rng: [1, 2, 3] };
    storage.setItem(SAVE_KEY, JSON.stringify(badRng));
    expect(validateSave(JSON.parse(storage.getItem(SAVE_KEY)!))).toBeNull();
  });

  it('hasSave is true only for a VALID save (an unreadable blob is not a resume)', () => {
    const storage = memoryStorage();
    expect(hasSave(storage)).toBe(false);
    storage.setItem(SAVE_KEY, 'garbage');
    expect(hasSave(storage)).toBe(false);
    const state = newGame(5);
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    expect(hasSave(storage)).toBe(true);
  });
});
