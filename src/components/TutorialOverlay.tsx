/**
 * C20 — Tutorial overlay (shell; the ten lessons arrive in C22).
 *
 * Shows the current step's objective (conventional label — SPEC §10), the
 * control to use, recovery guidance when the expected action is currently
 * impossible (the recovery probe), and Skip / Resume. Renders nothing while
 * no tutorial is active — no fake controls (SPEC §19). The title-screen
 * button that starts it is C23.
 */

import { TUTORIAL_STEPS } from '../data/tutorial/steps';
import { dispatch, useStore } from '../state/gameStore';

export function TutorialOverlay() {
  const { game } = useStore();
  const t = game?.tutorial;
  if (!game || t == null || TUTORIAL_STEPS.length === 0) return null;

  if (t.skipped) {
    return (
      <div className="tutorial-overlay" role="status">
        <span className="tutorial-objective">Tutorial paused.</span>
        <button
          type="button"
          className="tutorial-btn"
          onClick={() => dispatch({ type: 'TUTORIAL_RESUME' })}
        >
          Resume the tutorial
        </button>
      </div>
    );
  }

  if (t.step >= TUTORIAL_STEPS.length) {
    return (
      <div className="tutorial-overlay" role="status">
        <span className="tutorial-objective">
          Tutorial complete. The mandate continues.
        </span>
      </div>
    );
  }

  const step = TUTORIAL_STEPS[t.step];
  const recovery = step.recovery ? step.recovery(game) : null;

  return (
    <div className="tutorial-overlay" role="status">
      <div className="tutorial-head">
        <span className="tutorial-stepno">
          Step {t.step + 1} of {TUTORIAL_STEPS.length}
        </span>
        <button
          type="button"
          className="tutorial-btn"
          onClick={() => dispatch({ type: 'TUTORIAL_SKIP' })}
        >
          Skip tutorial
        </button>
      </div>
      <p className="tutorial-objective">{step.objective}</p>
      {step.control !== null && (
        <p className="tutorial-control">Use: {step.control}</p>
      )}
      {recovery !== null && <p className="tutorial-recovery">{recovery}</p>}
    </div>
  );
}
