/**
 * Advisor metadata (C17 — identity + operational flag only).
 *
 * C19 extends this with voice guides, interface accents, and dialogue pools
 * (SPEC §3, PLAN §11). Selection is mechanically neutral by contract:
 * which advisor speaks never changes simulation state (C19 neutrality test).
 */

import type { AdvisorId } from '../engine/types';

export interface AdvisorMeta {
  id: AdvisorId;
  name: string;
  /** Conventional description — used for tooltips so labels stay legible (SPEC §10). */
  description: string;
  /** Selectable in new-game setup only when true (no fake controls, core §19). */
  operational: boolean;
}

export const ADVISORS: readonly AdvisorMeta[] = [
  {
    id: 'mort',
    name: 'M.O.R.T.',
    description: 'Pessimistic robot advisor. Competent.',
    operational: true,
  },
  {
    id: 'bingo',
    name: 'B.I.N.G.O.',
    description: 'Cheerful customer-service advisor. Not yet on duty.',
    operational: false,
  },
  {
    id: 'handbook',
    name: 'The Mostly Reliable Galactic Handbook',
    description: 'Pompous advisory computer. Not yet on duty.',
    operational: false,
  },
];
