/**
 * The semantic event catalog (C19; PLAN §10 "catalog is data, not code").
 *
 * Every event the engine emits, with a conventional label (for tooltips,
 * the C30 Handbook, and the dialogue-variety audit). All 22 are narratable
 * by at least the complete advisor (M.O.R.T.); the functional-minimal
 * advisors (B.I.N.G.O., Handbook — full pools C25/C26) cover the frequent
 * subset and silently skip the rest (the bar keeps its last line).
 *
 * Pruned from the PLAN §10 draft (documented, so C34's audit sees the
 * full intended list):
 *  - victory / defeat — the end screen presents them (C8/C18);
 *  - event.resolved — arrives with narrative events (C29);
 *  - rival.defeated — the current rules never eliminate a rival.
 */

import type { SimEventType } from '../../engine/types';

export const DIALOGUE_EVENT_CATALOG: Record<SimEventType, { label: string }> = {
  'campaign.start': { label: 'Mandate accepted' },
  'advisor.switched': { label: 'Advisor change' },
  'travel.depart': { label: 'Setting course' },
  'travel.arrive': { label: 'Arrival' },
  'recon.reveal': { label: 'Reconnaissance' },
  'combat.victory': { label: 'Orbit secured' },
  'combat.defeat': { label: 'The defense held' },
  'combat.withdraw': { label: 'Withdrawal' },
  'invasion.success': { label: 'Landing secured' },
  'invasion.failure': { label: 'The ground held' },
  'planet.captured': { label: 'World captured' },
  'planet.integrated': { label: 'World integrated' },
  'occupation.unstable': { label: 'Stability warning' },
  'occupation.rebellion': { label: 'Rebellion' },
  'ship.built': { label: 'Ship built' },
  'fleet.repaired': { label: 'Hull restored' },
  'support.report': { label: 'Support fleet report' },
  'supernova.anomalous': { label: 'Stellar anomaly' },
  'supernova.critical': { label: 'Star critical' },
  'supernova.detonation': { label: 'Supernova' },
  'evacuation.done': { label: 'Evacuation complete' },
  'rival.expansion': { label: 'Rival expansion' },
  'rival.attack': { label: 'Rival attack' },
};

/** Events the engine will never emit (pruned from the PLAN §10 draft). */
export const PRUNED_EVENTS = [
  'victory',
  'defeat',
  'event.resolved',
  'rival.defeated',
] as const;
