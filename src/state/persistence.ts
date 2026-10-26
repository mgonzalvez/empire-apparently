/**
 * Persistence (C17 — the minimum save/resume contract).
 *
 * The save IS the serialized `GameState` (PLAN §7: the engine state is the
 * save — nothing else is persisted). This module is the state-layer bridge
 * to storage; the engine never touches it. C35 polishes this: export/import
 * with friendly errors, restart-current-seed, versioned migration, and the
 * full round-trip matrix (mid-travel, mid-event, mid-tutorial).
 */

import type { GameState } from '../engine/types';

export const SAVE_KEY = 'empire-apparently-save';

/** Minimal storage surface (localStorage in the browser; injectable in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * In-session fallback when localStorage is unavailable (private mode, some
 * test environments). A resume survives the session, not a reload — the
 * least-bad option when no durable storage exists.
 */
const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    memory.set(k, v);
  },
  removeItem: (k) => {
    memory.delete(k);
  },
};

export function defaultStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* storage access denied — fall through to memory */
  }
  return memoryStorage;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** sfc32 serializes as 4×u32 (PLAN §7). */
const isRngState = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 4 && v.every(isFiniteNumber);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Structural validation of a parsed save (C17: minimal — the fields the
 * resume flow depends on; C35 extends with the full schema + version
 * migration hook). Returns the state or null; never throws.
 */
export function validateSave(value: unknown): GameState | null {
  if (!isPlainObject(value)) return null;
  const s = value;
  if (s.v !== 1) return null; // unknown version → reject (migration is C35)
  if (!isFiniteNumber(s.seed) || !isFiniteNumber(s.tick)) return null;
  if (s.status !== 'active' && s.status !== 'victory' && s.status !== 'defeat') {
    return null;
  }
  if (!isRngState(s.rng) || !isRngState(s.narrRng)) return null;
  if (!isPlainObject(s.galaxy)) return null;
  if (!Array.isArray(s.galaxy.systems) || s.galaxy.systems.length === 0) {
    return null;
  }
  if (typeof s.galaxy.homeworldId !== 'string') return null;
  if (!isPlainObject(s.flagship) || !isPlainObject(s.flagship.ships)) {
    return null;
  }
  for (const k of ['interceptor', 'cruiser', 'transport']) {
    if (!isFiniteNumber(s.flagship.ships[k])) return null;
  }
  if (!Array.isArray(s.log)) return null;
  return value as unknown as GameState;
}

/** Persist the current game state. A missed autosave is survivable (C35 audits). */
export function saveGame(
  state: GameState,
  storage: StorageLike = defaultStorage(),
): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded / storage closed — nothing else to do */
  }
}

/**
 * Load and validate the saved game. A corrupt or absent save yields null —
 * the title screen simply offers no resume (no crash, no fake button).
 * `reviveSave` fills in fields added after a save was written (C19:
 * events, dialogue.lastShown/lastNarratedSeq/seq, lastDialogue) so older
 * saves resume cleanly without a version bump (migration hooks: C35).
 */
export function loadGame(storage: StorageLike = defaultStorage()): GameState | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const state = validateSave(JSON.parse(raw));
    return state ? reviveSave(state) : null;
  } catch {
    return null; // unparseable → treat as absent
  }
}

/** Fill in fields added since the save was written (additive v1 evolution). */
export function reviveSave(g: GameState): GameState {
  // C21 fields on older saves (additive v1 evolution — tutorial-only values).
  g.rivalsFrozen = g.rivalsFrozen ?? false;
  g.scriptedSupernova = g.scriptedSupernova ?? null;
  const dialogue = g.dialogue ?? { advisor: 'mort', recentIds: [], shown: {} };
  return {
    ...g,
    events: g.events ?? [],
    lastDialogue: g.lastDialogue ?? null,
    dialogue: {
      advisor: dialogue.advisor ?? 'mort',
      recentIds: dialogue.recentIds ?? [],
      shown: dialogue.shown ?? {},
      lastShown: dialogue.lastShown ?? {},
      lastNarratedSeq: dialogue.lastNarratedSeq ?? 0,
      // Events start at seq 1 (0 = nothing narrated); old saves without the
      // field get a clean start rather than a skipped first event.
      seq: Math.max(1, dialogue.seq ?? 1),
    },
  };
}

export function clearSave(storage: StorageLike = defaultStorage()): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** True only when a VALID save exists (an unreadable blob is not a save). */
export function hasSave(storage: StorageLike = defaultStorage()): boolean {
  return loadGame(storage) !== null;
}
