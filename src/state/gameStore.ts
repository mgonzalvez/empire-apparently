/**
 * Game store (C3): the single React↔engine bridge.
 *
 * `GameState` itself is pure data (PLAN §7). This module adds the screen
 * (null = title) and one piece of pure view state — the selected system —
 * which is deliberately NOT part of GameState and never part of a save.
 */

import { useSyncExternalStore } from 'react';
import {
  dispatchSim,
  newGame,
  type NewGameOptions,
} from '../engine/simulation';
import type { GameState, ShipClass, Specialization, Stance } from '../engine/types';

export interface StoreState {
  /** null = title screen. */
  game: GameState | null;
  /** View state only (not saved, not simulated). */
  selectedSystemId: string | null;
  /** Tick of the last dismissed battle report (view state). */
  dismissedBattleTick: number;
}

export type StoreAction =
  | ({ type: 'NEW_GAME'; seed: number } & NewGameOptions)
  | { type: 'MENU' }
  | { type: 'SELECT_SYSTEM'; systemId: string | null }
  | { type: 'WAIT'; years?: number }
  | { type: 'TRAVEL'; destinationId: string }
  | { type: 'REPAIR' }
  | { type: 'ATTACK'; targetId: string; stance: Stance }
  | { type: 'BUILD'; ship: ShipClass }
  | { type: 'REARM' }
  | { type: 'SPECIALIZE'; systemId: string; specialization: Specialization }
  | { type: 'REINFORCE'; systemId: string }
  | { type: 'DISMISS_BATTLE' }
  | { type: 'LOAD'; state: GameState }; // C35: schema validation with import

let current: StoreState = {
  game: null,
  selectedSystemId: null,
  dismissedBattleTick: -1,
};
const listeners = new Set<() => void>();

export function getState(): StoreState {
  return current;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dispatch(action: StoreAction): void {
  const next = reduce(current, action);
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

function reduce(s: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'NEW_GAME': {
      const game = newGame(action.seed, action);
      // Open on the homeworld — the one place the player definitely knows.
      return { game, selectedSystemId: game.galaxy.homeworldId, dismissedBattleTick: -1 };
    }
    case 'MENU':
      return { game: null, selectedSystemId: null, dismissedBattleTick: -1 };
    case 'SELECT_SYSTEM':
      // View-only: game state is untouched (core §4 — UI never advances time).
      if (!s.game) return s;
      return { ...s, selectedSystemId: action.systemId };
    case 'WAIT':
      if (!s.game) return s;
      return { ...s, game: dispatchSim(s.game, action) };
    case 'TRAVEL':
      if (!s.game) return s;
      return { ...s, game: dispatchSim(s.game, action) };
    case 'REPAIR':
    case 'ATTACK':
    case 'BUILD':
    case 'REARM':
    case 'SPECIALIZE':
    case 'REINFORCE':
      if (!s.game) return s;
      return { ...s, game: dispatchSim(s.game, action) };
    case 'DISMISS_BATTLE':
      if (!s.game?.lastBattle) return s;
      return { ...s, dismissedBattleTick: s.game.lastBattle.tick };
    case 'LOAD':
      return { game: action.state, selectedSystemId: null, dismissedBattleTick: -1 };
  }
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState);
}
