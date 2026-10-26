/**
 * Semantic event emission (C19). The engine emits typed events as it acts —
 * `d.events` is the factual record the dialogue layer consumes (PLAN §10).
 * The prose log (`d.log`) stays separate; a line of narration never enters
 * it, and an event never carries prose (P5).
 */

import { CAMPAIGN } from '../data/balance';
import type { GameState, SimEvent, SimEventType } from './types';

/** Cap on the retained event record (like maxLogEntries for the log). */
export const MAX_EVENTS: number = CAMPAIGN.maxEvents;

/** Emit a semantic event onto the draft (capped, newest last). */
export function emit(
  d: GameState,
  type: SimEventType,
  payload?: SimEvent['payload'],
): void {
  d.events.push({
    seq: d.dialogue.seq,
    tick: d.tick,
    type,
    ...(payload !== undefined ? { payload } : {}),
  });
  d.dialogue.seq += 1;
  if (d.events.length > MAX_EVENTS) {
    d.events.splice(0, d.events.length - MAX_EVENTS);
  }
}
