/**
 * C20 — Tutorial engine (headless; the scenario and the ten lessons land in
 * C21/C22). The step machine is deliberately a RECORDER, not a gate:
 *
 * - **Verify-only advance.** A step advances SOLELY on its authoritative state
 *   check (`TutorialStep.verify`). The engine never locks actions because of
 *   the tutorial: a different valid action can never trap the player, and a
 *   fabricated wrong action sequence can never *fail* a step — there is no
 *   failure state, only "not yet verified".
 * - **Recovery probe.** `TutorialStep.recovery(state)` emits guidance when the
 *   expected action is currently impossible. It is a pure derivation — the
 *   overlay calls it; the machine stores nothing extra.
 * - **Skip / resume.** `skipTutorial` pauses; `resumeTutorial` re-activates at
 *   the same step.
 * - **Milestones in save.** `GameState.tutorial` is plain JSON (scenario id,
 *   step index, completed indices, skipped flag) — a save/load mid-tutorial
 *   resumes the exact step (tested).
 */

import type { GameState, TutorialStep } from './types';

/** Begin the tutorial at step 0. No-op if one is already active. */
export function startTutorial(state: GameState, scenario: string): GameState {
  if (state.tutorial !== null) return state;
  const d = structuredClone(state);
  d.tutorial = { scenario, step: 0, completedSteps: [], skipped: false };
  return d;
}

/** Pause the tutorial (the overlay offers Resume; C23 handles completion). */
export function skipTutorial(state: GameState): GameState {
  const t = state.tutorial;
  if (t === null || t.skipped) return state;
  const d = structuredClone(state);
  d.tutorial = { ...t, skipped: true };
  return d;
}

/** Re-activate a paused tutorial at the same step. */
export function resumeTutorial(state: GameState): GameState {
  const t = state.tutorial;
  if (t === null || !t.skipped) return state;
  const d = structuredClone(state);
  d.tutorial = { ...t, skipped: false };
  return d;
}

/**
 * Verify-only advance — runs after every sim mutation (the store pipeline).
 * Pure, and returns the SAME reference unless a step actually advances.
 * Never touches the RNG streams, never rejects or alters an action.
 */
export function advanceTutorial(state: GameState, steps: TutorialStep[]): GameState {
  const t = state.tutorial;
  if (t === null || t.skipped) return state;
  if (steps.length === 0 || t.step >= steps.length) return state;
  if (!steps[t.step].verify(state)) return state;
  const d = structuredClone(state);
  d.tutorial = {
    ...t,
    completedSteps: [...t.completedSteps, t.step],
    step: t.step + 1,
  };
  return d;
}
