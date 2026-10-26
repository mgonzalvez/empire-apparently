/**
 * Advisor metadata (C17 identity + operational flag; C19 voice guides and
 * full selection). The pools live in `data/dialogue/pools.ts`; selection in
 * `engine/dialogue.ts`.
 *
 * Selection is mechanically neutral by contract: which advisor speaks never
 * changes simulation state — the neutrality test in tests/dialogue.test.ts
 * pins an identical sim-state hash under different advisors. The voice
 * guides (PLAN §11) are the writing contract for the funny passes
 * (C19/C25/C26/C34): write in event-family batches against these, not
 * line-by-line against the UI.
 */

import type { AdvisorId } from '../engine/types';

export interface AdvisorMeta {
  id: AdvisorId;
  name: string;
  /** Compact label for tight UI (bar pickers); full name lives in tooltips. */
  shortName: string;
  /** Conventional description — used for tooltips so labels stay legible (SPEC §10). */
  description: string;
  /**
   * The voice guide (PLAN §11): cadence, vocabulary, what the advisor
   * would never say. Every line in the pool must comply; the funny passes
   * check against this, not against a feel.
   */
  voiceGuide: string;
  /** Selectable in setup and switchable in-game. From C19 all three are
   * operational; M.O.R.T. is complete, the other two are functional-
   * minimal until C25/C26 expand them. */
  operational: boolean;
  /** Pool status shown in the setup note (no fake controls: the note says
   * exactly what the pool contains). */
  poolNote: string;
}

export const ADVISORS: readonly AdvisorMeta[] = [
  {
    id: 'mort',
    name: 'M.O.R.T.',
    shortName: 'M.O.R.T.',
    description: 'Pessimistic robot advisor. Competent.',
    voiceGuide:
      'Dry, pessimistic, precise. Short declarative sentences. Quantifies doom ' +
      "('the margin was thinner than you felt'). Secretly proud, never says so. " +
      'Reports bad news as if filing it. Never exclaims, never jokes at the player ' +
      "itself, never addresses the player by name. What it would never say: " +
      'enthusiasm, exclamation marks, puns, anything that promises a good outcome.',
    operational: true,
    poolNote: 'Fully briefed.',
  },
  {
    id: 'bingo',
    name: 'B.I.N.G.O.',
    shortName: 'B.I.N.G.O.',
    description: 'Cheerful customer-service advisor.',
    voiceGuide:
      "Relentlessly cheerful customer-service cadence. Addresses the player as " +
      "'sir' or 'madam'. Treats catastrophes as service opportunities ('a territory " +
      "update'). Quotes institutional euphemisms in scare-quotes. No malice, ever — " +
      'the worst thing it can do is schedule your grief. What it would never say: ' +
      'a real threat, a real insult, anything that admits the institution is failing.',
    operational: true,
    poolNote: 'On minimal duty — the full briefing arrives later.',
  },
  {
    id: 'handbook',
    name: 'The Mostly Reliable Galactic Handbook',
    shortName: 'Handbook',
    description: 'Pompous advisory computer.',
    voiceGuide:
      "Pompous, encyclopedic, measured. Refers to itself in the third person " +
      "('The Handbook notes...'). Wry footnotes and definitions. Corrects the " +
      "reader's assumptions ('the reader will note...'). Footnotes are actual " +
      'footnotes in spirit: asides that add a fact, not a joke. What it would ' +
      'never say: contractions, slang, anything casual, a direct address to the ' +
      'player beyond "the reader".',
    operational: true,
    poolNote: 'On minimal duty — the full reference arrives later.',
  },
];
