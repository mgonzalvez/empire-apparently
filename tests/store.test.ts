import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch, getState } from '../src/state/gameStore';

describe('gameStore — screen & view state', () => {
  beforeEach(() => {
    dispatch({ type: 'MENU' });
  });

  it('NEW_GAME creates a game; MENU returns to the title', () => {
    expect(getState().game).toBeNull();
    dispatch({ type: 'NEW_GAME', seed: 11 });
    expect(getState().game).not.toBeNull();
    dispatch({ type: 'MENU' });
    expect(getState().game).toBeNull();
  });

  it('UI navigation (selecting systems) advances zero time and never touches game state (core §4)', () => {
    dispatch({ type: 'NEW_GAME', seed: 11 });
    const before = getState();
    for (const id of ['S00', 'S05', 'S12', null, 'S19']) {
      dispatch({ type: 'SELECT_SYSTEM', systemId: id });
      const after = getState();
      expect(after.game).toBe(before.game); // reference-identical: untouched
      expect(after.game?.tick).toBe(0);
    }
    expect(getState().selectedSystemId).toBe('S19');
  });

  it('WAIT flows through to the sim, exactly once per action', () => {
    dispatch({ type: 'NEW_GAME', seed: 11 });
    dispatch({ type: 'WAIT' });
    const g = getState().game;
    expect(g?.tick).toBe(1);
    expect(g?.v).toBe(1);
  });

  it('SELECT_SYSTEM with no game is a no-op', () => {
    dispatch({ type: 'SELECT_SYSTEM', systemId: 'S00' });
    expect(getState().game).toBeNull();
    expect(getState().selectedSystemId).toBeNull();
  });

  it('NEW_GAME replaces any previous game (fresh start, fresh selection)', () => {
    dispatch({ type: 'NEW_GAME', seed: 5 });
    dispatch({ type: 'SELECT_SYSTEM', systemId: 'S01' });
    dispatch({ type: 'NEW_GAME', seed: 6 });
    const s = getState();
    expect(s.game?.seed).toBe(6);
    expect(s.selectedSystemId).toBeNull();
  });
});
