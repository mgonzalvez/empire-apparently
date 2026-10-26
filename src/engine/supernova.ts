/**
 * Supernova pipeline (C15 warnings, C16 evacuation & detonation; core §10).
 *
 * - Candidate seeding (zero/low/normal) lives in galaxy.ts — the homeworld
 *   and the opening zone are never candidates (fairness, tested).
 * - Each candidate's instability rises by its seeded per-year rate in the
 *   stars stage (core §4 year-step 6). Non-candidates never move.
 * - States: stable (<50) → anomalous (≥50, alert) → critical (≥75, range
 *   window) → supernova (=100, armed — detonates on the NEXT tick, so the
 *   warning is always visible) → destroyed (remnant).
 * - Evacuation (C16): a time-costed order (2 ticks, credit cost) that moves
 *   ~60% of the population to the capital and withdraws stationed fleets.
 *   It does not stop the star — it preserves people and ships (core §10:
 *   "does not guarantee full recovery").
 * - Detonation (C16): planet destroyed, local player fleets destroyed,
 *   production permanently lost, the system becomes a non-colonizable
 *   remnant, factual event report.
 * - Warnings precede action: the critical warning always comes ≥ 5 years
 *   before detonation (rate ≤ 5), and the shown window is always a RANGE —
 *   its upper bound never exceeds the true remaining time + 1 (no false
 *   precision). Local presence (flagship or support fleet docked) narrows
 *   the range from below.
 * - Every transition is logged; the map marker and the planet panel show
 *   the state at a glance.
 */

import { GALAXY } from '../data/balance';
import { totalShips } from './fleets';
import { quoteVoyage } from './movement';
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
 * EVACUATE (C16; instant — the order is paid, then it takes
 * `evacuation.ticks` years to complete). Core §10: preserves part of the
 * population, withdraws stationed fleets, does not stop the star.
 */
export function canEvacuate(state: GameState, systemId: string): { ok: boolean; reason: string | null } {
  const s = state.galaxy.systems.find((x) => x.id === systemId);
  if (!s || s.destroyed) return { ok: false, reason: 'There is nothing left to evacuate.' };
  if (s.ownerId !== 'player') return { ok: false, reason: 'Only our own worlds can be evacuated.' };
  if (!s.planet) return { ok: false, reason: 'No population to evacuate.' };
  const st = supernovaState(s);
  if (st === 'stable' || st === 'anomalous') {
    return { ok: false, reason: 'The star is not critical yet — evacuation is only offered when it is.' };
  }
  if (s.evacuationTicks > 0) return { ok: false, reason: 'Evacuation already in progress.' };
  if (state.empire.credits < sup.evacuation.credits) {
    return { ok: false, reason: `Evacuation costs ${sup.evacuation.credits}C.` };
  }
  return { ok: true, reason: null };
}

export function evacuate(state: GameState, systemId: string): GameState {
  if (!canEvacuate(state, systemId).ok) return state;
  const d = structuredClone(state) as GameState;
  const s = d.galaxy.systems.find((x) => x.id === systemId)!;
  d.empire.credits -= sup.evacuation.credits;
  s.evacuationTicks = sup.evacuation.ticks;
  d.log.push({
    tick: d.tick,
    kind: 'info',
    text: `Evacuation of ${s.name} ordered — ${sup.evacuation.ticks} years, ${sup.evacuation.credits}C.`,
  });
  return d;
}

/** Evacuation complete: ~60% of the population reaches the capital, fleets withdraw. */
function completeEvacuation(d: GameState, s: System): void {
  let saved = 0;
  const p = s.planet;
  if (p) {
    saved = Math.round(p.population * sup.evacuation.populationSavedFraction);
    const home = d.galaxy.systems.find((x) => x.id === d.galaxy.homeworldId);
    if (s.id !== d.galaxy.homeworldId && home?.planet) {
      home.planet.population += saved;
      p.population -= saved;
    } else {
      p.population = saved; // evacuating the capital itself: only the shelters' share survives
    }
  }
  // Stationed fleets withdraw toward home (no fuel → hold; fate takes its course).
  for (const f of d.supports) {
    if (f.travel !== null || f.systemId !== s.id) continue;
    f.mission = null;
    const dest = f.homeId ?? d.galaxy.homeworldId;
    const q = quoteVoyage(d.galaxy.systems, s.id, dest, totalShips(f), d.empire.fuel);
    if (q.ok) {
      d.empire.fuel -= q.fuelCost;
      f.travel = { fromId: s.id, toId: dest, departTick: d.tick, arriveTick: d.tick + q.years! };
      f.supportState = 'returning';
      d.log.push({ tick: d.tick, kind: 'info', text: `${f.name} withdraws from ${s.name}.` });
    } else {
      f.supportState = 'idle';
      d.log.push({ tick: d.tick, kind: 'warning', text: `${f.name} cannot withdraw from ${s.name} (${q.reason}).` });
    }
  }
  // The flagship, if docked there, withdraws too (an emergency is an emergency).
  const fl = d.flagship;
  if (fl.travel === null && fl.systemId === s.id && s.id !== d.galaxy.homeworldId) {
    const q = quoteVoyage(d.galaxy.systems, s.id, d.galaxy.homeworldId, totalShips(fl), d.empire.fuel);
    if (q.ok) {
      d.empire.fuel -= q.fuelCost;
      fl.travel = { fromId: s.id, toId: d.galaxy.homeworldId, departTick: d.tick, arriveTick: d.tick + q.years! };
      d.log.push({ tick: d.tick, kind: 'info', text: `The flagship withdraws from ${s.name}.` });
    }
  }
  d.log.push({
    tick: d.tick,
    kind: 'event',
    text: `Evacuation of ${s.name} complete — ${saved}M people reach the capital, and the stationed forces withdraw.`,
  });
}

/** Detonation: the planet is gone, local player military is gone, remnant remains. */
function detonate(d: GameState, s: System): void {
  const population = s.planet?.population ?? 0;
  let flagshipLost = false;
  if (d.flagship.travel === null && d.flagship.systemId === s.id) {
    d.flagship.ships = { interceptor: 0, cruiser: 0, transport: 0 };
    d.flagship.troops = 0;
    d.flagship.hull = 0;
    flagshipLost = true;
  }
  const lostFleets = d.supports.filter((f) => f.travel === null && f.systemId === s.id);
  d.supports = d.supports.filter((f) => !(f.travel === null && f.systemId === s.id));

  s.planet = null;
  s.ownerId = null;
  s.previousOwnerId = null;
  s.occupation = 'none';
  s.defense = 0;
  s.evacuationTicks = 0;
  s.destroyed = true;

  // Survived supernova (core §12 stat): the star detonated and the campaign
  // continues. The homeworld is never a candidate (fairness), so every
  // detonation is one the player survives.
  d.stats.supernovas += 1;

  d.log.push({
    tick: d.tick,
    kind: 'event',
    text: `${s.name} goes supernova. The planet and its ${population}M people are gone; the system is a stellar remnant.`,
  });
  if (flagshipLost) {
    d.log.push({ tick: d.tick, kind: 'warning', text: 'The flagship was destroyed in the blast.' });
  }
  for (const f of lostFleets) {
    d.log.push({ tick: d.tick, kind: 'warning', text: `${f.name} was destroyed in the blast.` });
  }
}

/**
 * Stars pipeline stage (core §4 year-step 6). Mutates the draft.
 * Order: complete evacuations (an evacuation finishing on the detonation
 * tick still saves its people) → detonate last tick's armed stars →
 * advance instability + transition alerts (a star that reaches 100 this
 * tick is armed and detonates NEXT tick — the warning is always visible).
 */
export function applySupernovas(d: GameState): void {
  for (const s of d.galaxy.systems) {
    if (s.evacuationTicks <= 0 || s.destroyed) continue;
    s.evacuationTicks -= 1;
    if (s.evacuationTicks <= 0) completeEvacuation(d, s);
  }
  for (const s of d.galaxy.systems) {
    if (!s.destroyed && s.supernovaCandidate && s.instability >= 100) detonate(d, s);
  }
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
        text: `${s.name} is CRITICAL — the star should go within ${lo}–${hi} years. Evacuation can preserve part of what is there.`,
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
