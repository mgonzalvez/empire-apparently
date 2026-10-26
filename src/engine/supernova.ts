/**
 * Supernova instability pipeline (C15; core §10).
 *
 * - Candidate seeding (zero/low/normal) lives in galaxy.ts — the homeworld
 *   and the opening zone are never candidates (fairness, tested).
 * - Each candidate's instability rises by its seeded per-year rate in the
 *   stars stage (core §4 year-step 6). Non-candidates never move.
 * - States: stable (<50) → anomalous (≥50) → critical (≥75) → supernova
 *   (=100, armed — detonation resolution is C16) → destroyed (remnant, C16).
 * - Warnings precede action: the critical warning always comes ≥ 5 years
 *   before detonation (rate ≤ 5), and the shown window is always a RANGE —
 *   its upper bound never exceeds the true remaining time + 1 (no false
 *   precision). Local presence (flagship or support fleet docked) narrows
 *   the range from below.
 * - Every transition is logged; the map marker and the planet panel show
 *   the state at a glance.
 */

import { GALAXY } from '../data/balance';
import type { GameState, System } from './types';

export type SupernovaState =
  | 'stable'
  | 'anomalous'
  | 'critical'
  | 'supernova'
  | 'destroyed';

const sup = GALAXY.supernova;

export function supernovaState(s: System): SupernovaState {
  if (s.destroyed) return 'destroyed';
  if (s.instability >= sup.thresholdDetonation) return 'supernova';
  if (s.instability >= sup.thresholdCritical) return 'critical';
  if (s.instability >= sup.thresholdAnomalous) return 'anomalous';
  return 'stable';
}

/** Local presence improves the risk assessment (core §10 scouting clause). */
export function isLocallyScouted(d: GameState, systemId: string): boolean {
  if (d.flagship.travel === null && d.flagship.systemId === systemId) return true;
  return d.supports.some((f) => f.travel === null && f.systemId === systemId);
}

/**
 * Remaining-time window shown when a system is critical: a RANGE, never an
 * exact number. Upper bound = floor(remaining) + 1, so the window's max
 * minus one never exceeds the true remaining time (acceptance: the warning
 * precedes detonation by ≥ the shown window minus 1 year).
 */
export function criticalWindow(s: System, scouted: boolean): [number, number] {
  if (s.instabilityRate <= 0) return [3, 6];
  const remaining = (sup.thresholdDetonation - s.instability) / s.instabilityRate;
  let hi = Math.floor(remaining) + 1;
  let lo = Math.max(1, hi - 3);
  if (scouted) lo = Math.max(lo, Math.round(remaining) - 1);
  if (hi < lo) hi = lo;
  return [lo, hi];
}

/**
 * Stars pipeline stage (core §4 year-step 6). Mutates the draft.
 * C15: advance instability + transition alerts. C16: detonation resolution.
 */
export function applySupernovas(d: GameState): void {
  for (const s of d.galaxy.systems) {
    if (!s.supernovaCandidate || s.destroyed || s.instability >= 100) continue;
    const prev = supernovaState(s);
    s.instability = Math.min(100, s.instability + s.instabilityRate);
    const cur = supernovaState(s);
    if (prev === cur) continue;
    if (cur === 'anomalous') {
      d.log.push({
        tick: d.tick,
        kind: 'event',
        text: `Stellar anomalies detected at ${s.name}. Astronomers are "studying it" and refusing to elaborate.`,
      });
    } else if (cur === 'critical') {
      const [lo, hi] = criticalWindow(s, isLocallyScouted(d, s.id));
      d.log.push({
        tick: d.tick,
        kind: 'warning',
        text: `${s.name} is CRITICAL — the star should go within ${lo}–${hi} years. Evacuation can preserve part of what is there (C16).`,
      });
    } else if (cur === 'supernova') {
      d.log.push({
        tick: d.tick,
        kind: 'warning',
        text: `${s.name} is on the edge. The star goes very soon.`,
      });
    }
  }
}
