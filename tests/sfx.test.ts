/**
 * C18 — WebAudio SFX: off by default (core §20), persisted preference,
 * playback is a silent no-op without an AudioContext (node), and new games
 * record the preference into `settings.sound` for the save file.
 *
 * (Synthesized audio itself is a browser concern — C33 does the final pass
 * over travel/battle/alert/explosion cues with a human at the keyboard.)
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  SOUND_KEY,
  isSoundOn,
  playSfx,
  setSoundOn,
  type StorageLike,
} from '../src/audio/sfx';
import { dispatch, getState } from '../src/state/gameStore';

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

afterEach(() => {
  setSoundOn(false); // keep the session's default storage clean
  dispatch({ type: 'MENU' });
});

describe('sfx — preference (C18)', () => {
  it('sound is OFF by default (core §20)', () => {
    expect(isSoundOn(memoryStorage())).toBe(false);
  });

  it('the preference persists in storage and clears on disable', () => {
    const storage = memoryStorage();
    setSoundOn(true, storage);
    expect(isSoundOn(storage)).toBe(true);
    expect(storage.getItem(SOUND_KEY)).toBe('on');
    setSoundOn(false, storage);
    expect(isSoundOn(storage)).toBe(false);
    expect(storage.getItem(SOUND_KEY)).toBeNull();
  });

  it('a new game records the persisted preference into settings.sound', () => {
    setSoundOn(true);
    try {
      dispatch({ type: 'NEW_GAME', seed: 31 });
      expect(getState().game!.settings.sound).toBe(true);
    } finally {
      setSoundOn(false);
    }
    dispatch({ type: 'NEW_GAME', seed: 32 });
    expect(getState().game!.settings.sound).toBe(false);
  });
});

describe('sfx — playback safety (C18)', () => {
  it('playSfx is a silent no-op without an AudioContext (node), on or off', () => {
    expect(() => playSfx('ui')).not.toThrow();
    setSoundOn(true);
    for (const kind of [
      'ui',
      'travel',
      'build',
      'combat-win',
      'combat-loss',
      'victory',
      'defeat',
    ] as const) {
      expect(() => playSfx(kind)).not.toThrow();
    }
  });
});
