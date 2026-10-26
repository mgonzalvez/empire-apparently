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
import type { GameState, ShipClass, Specialization, Stance, SupportMission } from '../engine/types';
import { clearSave, saveGame } from './persistence';
import { isSoundOn } from '../audio/sfx';

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
  | { type: 'COMMISSION' } // C13: support fleet at the shipyard (instant)
  | {
      type: 'ASSIGN_MISSION';
      fleetId: string;
      mission: SupportMission | null;
      targetId: string | null;
    } // C14: assign a support-fleet mission (instant)
  | { type: 'EVACUATE'; systemId: string } // C16: order an evacuation (instant, then 2 years)
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
  const prev = current;
  current = next;
  // Autosave (C17, PLAN §7): persist whenever the GAME state changes.
  // View-only actions (selection, dialogs) keep the same game reference and
  // never write. A finished mandate has nothing left to resume — the save
  // is cleared so "Resume Previous Mistake" never offers a dead campaign.
  if (next.game && next.game !== prev.game) {
    if (next.game.status === 'active') saveGame(next.game);
    else clearSave();
  }
  for (const l of listeners) l();
}

function reduce(s: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'NEW_GAME': {
      // C18: record the persisted sound preference in the new save
      // (off by default; playback itself reads the audio module).
      const game = newGame(action.seed, {
        ...action,
        sound: action.sound ?? isSoundOn(),
      });
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
    case 'COMMISSION':
    case 'ASSIGN_MISSION':
    case 'EVACUATE':
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
