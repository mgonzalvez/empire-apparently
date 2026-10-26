/**
 * C20 — tutorial step list (shell). The machine (`engine/tutorial.ts`), the
 * store pipeline, and the overlay are live; the content arrives in C22 (the
 * ten lessons) on the C21 scenario. Until then the machine runs on an empty
 * list — every call is a cheap no-op, so the pipeline is already real.
 *
 * `TUTORIAL_SCENARIO` is the id the campaign records while the tutorial runs
 * (C21 builds the deterministic 7-system region it plays on; C23 enables the
 * title button — "Instructional Misfortune").
 */

import type { TutorialStep } from '../../engine/types';

export const TUTORIAL_SCENARIO = 'instructional-misfortune';

/** C22: the ten lessons. Empty until then. */
export const TUTORIAL_STEPS: TutorialStep[] = [];
