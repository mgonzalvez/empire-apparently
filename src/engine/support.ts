/**
 * Support fleets (C13; core §7 "Support fleet behavior").
 *
 * Simple state machines — NOT autonomous agents:
 *  - Commissioned at a shipyard for REAL ships (table costs) — never free,
 *    never more than SUPPORT.maxFleets.
 *  - Range and fuel rules identical to the flagship (quoteVoyage).
 *  - They never invade: C13 support fleets have no attack order, full stop
 *    (combat + missions arrive with C14, gated by explicit orders).
 *  - Unassigned fleets patrol home (the Tier-0 fallback): docked at home
 *    they are Patrolling; away, they travel home.
 *  - Critically damaged (hull < criticalHull) they head home when possible.
 *  - When a move is infeasible (range/fuel) the fleet REMAINS IDLE rather
 *    than silently violating a rule (core §7).
 *  - Significant events are logged; no events, no log spam.
 */

import { SUPPORT } from '../data/balance';
import { buildCost, isShipyard, totalShips } from './fleets';
import { quoteVoyage } from './movement';
import type { Fleet, GameState } from './types';

export const SUPPORT_COST = {
  credits:
    SUPPORT.startingShips.interceptor * buildCost('interceptor').credits +
    SUPPORT.startingShips.cruiser * buildCost('cruiser').credits +
    SUPPORT.startingShips.transport * buildCost('transport').credits,
  materials:
    SUPPORT.startingShips.interceptor * buildCost('interceptor').materials +
    SUPPORT.startingShips.cruiser * buildCost('cruiser').materials +
    SUPPORT.startingShips.transport * buildCost('transport').materials,
} as const;

export const STATE_LABEL: Record<Fleet['supportState'] & string, string> = {
  idle: 'Idle',
  traveling: 'In transit',
  scouting: 'Scouting',
  patrolling: 'Patrolling home',
  reinforcing: 'Reinforcing',
  defending: 'Defending',
  returning: 'Returning to base',
};

/** Commissioning gate (UI + engine, same source). */
export function canCommission(state: GameState): { ok: boolean; reason: string | null } {
  if (state.supports.length >= SUPPORT.maxFleets) {
    return { ok: false, reason: `The empire fielded ${SUPPORT.maxFleets} support fleets — the maximum.` };
  }
  if (!isShipyard(state, state.flagship.systemId)) {
    return { ok: false, reason: 'Support fleets are commissioned at a shipyard.' };
  }
  const cost = SUPPORT_COST;
  if (state.empire.credits < cost.credits || state.empire.materials < cost.materials) {
    return {
      ok: false,
      reason: `Commissioning costs ${cost.credits}C / ${cost.materials}M (real ships).`,
    };
  }
  return { ok: true, reason: null };
}

/** COMMISSION (instant, 0 ticks, off-ledger — like BUILD). */
export function commission(state: GameState): GameState {
  if (!canCommission(state).ok) return state;
  const d = structuredClone(state) as GameState;
  const yard = d.galaxy.systems.find((s) => s.id === d.flagship.systemId)!;
  d.empire.credits -= SUPPORT_COST.credits;
  d.empire.materials -= SUPPORT_COST.materials;
  const n = d.supports.length + 1;
  d.supports.push({
    id: `sf-${n}`,
    name: `Support Fleet ${n}`,
    systemId: yard.id,
    ships: { ...SUPPORT.startingShips },
    hull: 100,
    troops: 0,
    orders: { type: 'hold', targetId: null },
    travel: null,
    homeId: yard.id,
    supportState: 'patrolling', // unassigned → patrol home (Tier-0 fallback)
  });
  const f = d.supports[d.supports.length - 1];
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `${f.name} commissioned at ${yard.name} (${totalShips(f)} ships, ${SUPPORT_COST.credits}C / ${SUPPORT_COST.materials}M).`,
  });
  return d;
}

/** Begin a voyage for a support fleet (fuel paid at departure, like the flagship). */
function depart(d: GameState, f: Fleet, toId: string, years: number, fuelCost: number): void {
  d.empire.fuel -= fuelCost;
  f.travel = {
    fromId: f.systemId,
    toId,
    departTick: d.tick,
    arriveTick: d.tick + years,
  };
  const dest = d.galaxy.systems.find((s) => s.id === toId)!;
  d.log.push({
    tick: d.tick,
    kind: 'info',
    text: `${f.name} sets course for ${dest.name} (${fuelCost} fuel).`,
  });
}

/**
 * Support fleets pipeline step (core §4 year-step 4, after flagship
 * movement). Mutates the draft.
 */
export function applySupportFleets(d: GameState): void {
  for (const f of d.supports) {
    // Arrivals resolve on the exact tick (same rule as the flagship), then
    // the fleet's state is re-evaluated in the same tick (patrolling/idle).
    if (f.travel !== null) {
      if (d.tick < f.travel.arriveTick) continue;
      f.systemId = f.travel.toId;
      f.travel = null;
      const dest = d.galaxy.systems.find((s) => s.id === f.systemId)!;
      d.log.push({ tick: d.tick, kind: 'info', text: `${f.name} arrives at ${dest.name}.` });
    }

    const homeId = f.homeId;
    const home = homeId ? d.galaxy.systems.find((s) => s.id === homeId) : undefined;
    if (!homeId || !home) {
      f.supportState = 'idle'; // home gone (C16 destruction) — idle, no rule bent
      continue;
    }
    const away = f.systemId !== homeId;

    // Critically damaged → return to safety when possible (core §7).
    if (f.hull < SUPPORT.criticalHull) {
      if (!away) {
        f.supportState = 'idle'; // damaged at home: wait
        continue;
      }
      const q = quoteVoyage(d.galaxy.systems, f.systemId, homeId, totalShips(f), d.empire.fuel);
      if (q.ok) {
        depart(d, f, homeId, q.years!, q.fuelCost);
        f.supportState = 'returning';
      } else {
        f.supportState = 'idle'; // infeasible — idle rather than break a rule
      }
      continue;
    }

    // C13: unassigned fleets patrol home (the Tier-0 fallback).
    // (C14 mission handling slots in above this branch.)
    if (away) {
      const q = quoteVoyage(d.galaxy.systems, f.systemId, homeId, totalShips(f), d.empire.fuel);
      if (q.ok) {
        depart(d, f, homeId, q.years!, q.fuelCost);
        f.supportState = 'traveling';
      } else {
        f.supportState = 'idle';
      }
    } else {
      f.supportState = 'patrolling';
    }
  }
}
