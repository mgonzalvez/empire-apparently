/**
 * Support fleets (C13, missions C14; core §7 "Support fleet behavior").
 *
 * Simple state machines — NOT autonomous agents:
 *  - Commissioned at a shipyard for REAL ships (table costs) — never free,
 *    never more than SUPPORT.maxFleets.
 *  - Range and fuel rules identical to the flagship (quoteVoyage).
 *  - Unassigned fleets patrol home (the Tier-0 fallback).
 *  - Critically damaged (hull < criticalHull) they head home when possible.
 *  - When a move is infeasible (range/fuel) the fleet REMAINS IDLE rather
 *    than silently violating a rule (core §7).
 *
 * Missions (C14; core §7) — the fixed inventory of four, each resolving
 * with the SAME rules as player fleets:
 *  - SCOUT: travel to an unexplored system; arrival reveals it exactly the
 *    way a flagship arrival does (the `explored` flag, the same facts).
 *  - PATROL: station at a player world; each year, weak hostile flotillas
 *    (≤ weakFleetSize) that are grid-adjacent are intercepted and lose
 *    ships. It is presence, not a garrison.
 *  - REINFORCE: board troops at home (standard rearm cost, paid at
 *    assignment), travel to an occupied world, top its garrison up to the
 *    recommended level, return home.
 *  - DEFEND: station at a player world; the fleet's combat strength is
 *    added to that world's defensive strength (same derived strength a
 *    player fleet would bring). If the world falls, the fleet breaks off
 *    and takes hull damage.
 *
 * Support fleets NEVER invade: no mission takes an independent or rival
 * system, and no mission grants an attack order.
 *
 * Significant events are logged; no events, no log spam (infeasibility is
 * logged once, on the transition into idle).
 */

import { FLEET, SUPPORT } from '../data/balance';
import {
  buildCost,
  combatStrength,
  isShipyard,
  maxTroops,
  totalShips,
} from './fleets';
import { gridNeighbors } from './galaxy';
import { quoteVoyage } from './movement';
import { recommendedGarrison } from './occupation';
import { emit } from './events';
import type { Fleet, GameState, System, SupportFleetMission, SupportMission } from './types';

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

export const STATE_LABEL: Record<NonNullable<Fleet['supportState']>, string> = {
  idle: 'Idle',
  traveling: 'In transit',
  scouting: 'Scouting',
  patrolling: 'Patrolling',
  reinforcing: 'Reinforcing',
  defending: 'Defending',
  returning: 'Returning to base',
};

export const MISSION_LABEL: Record<SupportMission, string> = {
  scout: 'Scout',
  patrol: 'Patrol',
  reinforce: 'Reinforce',
  defend: 'Defend',
};

const sys = (d: GameState, id: string): System | undefined =>
  d.galaxy.systems.find((s) => s.id === id);

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
    mission: null,
  });
  const f = d.supports[d.supports.length - 1];
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `${f.name} commissioned at ${yard.name} (${totalShips(f)} ships, ${SUPPORT_COST.credits}C / ${SUPPORT_COST.materials}M).`,
  });
  return d;
}

// ─────────────────────────── C14: missions ───────────────────────────

/** Is this (mission, target) pair a real assignment? */
export function missionTargetValid(
  d: GameState,
  m: SupportFleetMission,
): { ok: boolean; reason: string | null } {
  const t = sys(d, m.targetId);
  if (!t) return { ok: false, reason: 'The target no longer exists.' };
  switch (m.type) {
    case 'scout':
      if (t.destroyed) return { ok: false, reason: 'The target is a ruin.' };
      if (t.explored) return { ok: false, reason: 'Already charted.' };
      return { ok: true, reason: null };
    case 'patrol':
    case 'defend':
      if (t.ownerId !== 'player') return { ok: false, reason: 'The world is no longer ours.' };
      return { ok: true, reason: null };
    case 'reinforce':
      if (t.ownerId !== 'player' || t.planet === null) {
        return { ok: false, reason: 'The world is no longer ours.' };
      }
      if (t.occupation !== 'occupied') {
        return { ok: false, reason: 'The world already stands on its own.' };
      }
      return { ok: true, reason: null };
  }
}

/** Reinforce boarding cost (standard rearm rate; paid at assignment). */
export function reinforceBoardingCost(f: Fleet): number {
  return (maxTroops(f) - f.troops) * FLEET.rearmCostPerTroop;
}

/** ASSIGN_MISSION gate (UI + engine, same source). mission = null cancels. */
export function canAssignMission(
  state: GameState,
  fleetId: string,
  mission: SupportMission | null,
  targetId: string | null,
): { ok: boolean; reason: string | null } {
  const f = state.supports.find((x) => x.id === fleetId);
  if (!f) return { ok: false, reason: 'No such fleet.' };
  if (mission === null) return { ok: true, reason: null }; // stand down is always possible
  if (!targetId) return { ok: false, reason: 'Choose a target.' };
  const t = sys(state, targetId);
  if (!t) return { ok: false, reason: 'Unknown target.' };
  const v = missionTargetValid(state, { type: mission, targetId });
  if (!v.ok) return v;
  if (mission === 'reinforce') {
    if (f.travel !== null || f.systemId !== f.homeId) {
      return { ok: false, reason: 'The fleet must be at home to board troops.' };
    }
    if (t.planet && recommendedGarrison(t.planet, t, state.galaxy) <= t.planet.garrison) {
      return { ok: false, reason: 'The garrison is already at strength.' };
    }
    const cost = reinforceBoardingCost(f);
    if (cost > 0 && state.empire.credits < cost) {
      return { ok: false, reason: `Boarding costs ${cost}C.` };
    }
  }
  return { ok: true, reason: null };
}

/** ASSIGN_MISSION (instant, 0 ticks — sets an order; the machine executes). */
export function assignMission(
  state: GameState,
  fleetId: string,
  mission: SupportMission | null,
  targetId: string | null,
): GameState {
  if (mission !== null) {
    if (!canAssignMission(state, fleetId, mission, targetId).ok) return state;
  } else {
    if (!canAssignMission(state, fleetId, null, null).ok) return state;
  }
  const d = structuredClone(state) as GameState;
  const f = d.supports.find((x) => x.id === fleetId)!;
  const t = mission && targetId ? sys(d, targetId) : undefined;

  if (mission === 'reinforce') {
    const cost = reinforceBoardingCost(f);
    d.empire.credits -= cost;
    f.troops = maxTroops(f);
    d.log.push({
      tick: d.tick,
      kind: 'economy',
      text: `${f.name} boards ${f.troops} troops at ${sys(d, f.homeId!)?.name ?? 'base'} (${cost}C).`,
    });
  }

  f.mission = mission && t ? { type: mission, targetId: t.id } : null;
  d.log.push({
    tick: d.tick,
    kind: 'info',
    text:
      f.mission && t
        ? `${f.name} assigned: ${MISSION_LABEL[f.mission.type]} — ${t.name}.`
        : `${f.name} stands down and returns home.`,
  });
  return d;
}

// ─────────────────────────── movement helpers ───────────────────────────

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

/** Try to travel `f` to `toId`; infeasible → idle (logged once on transition). */
function travelTo(
  d: GameState,
  f: Fleet,
  toId: string,
  enRouteState: NonNullable<Fleet['supportState']>,
): void {
  const q = quoteVoyage(d.galaxy.systems, f.systemId, toId, totalShips(f), d.empire.fuel);
  if (q.ok) {
    depart(d, f, toId, q.years!, q.fuelCost);
    f.supportState = enRouteState;
  } else {
    if (f.supportState !== 'idle') {
      d.log.push({
        tick: d.tick,
        kind: 'warning',
        text: `${f.name} cannot reach ${sys(d, toId)?.name ?? '?'} (${q.reason}) — holding.`,
      });
    }
    f.supportState = 'idle';
  }
}

/** Mission complete / voided: clear the order and make for home. */
function standDown(d: GameState, f: Fleet, why: string | null): void {
  f.mission = null;
  if (why) {
    d.log.push({ tick: d.tick, kind: 'info', text: `${f.name}: ${why}` });
  }
  sendHome(d, f);
}

/** Return to home: travel when possible, patrol when docked, idle when stuck. */
function sendHome(d: GameState, f: Fleet): void {
  const homeId = f.homeId;
  if (!homeId) {
    f.supportState = 'idle';
    return;
  }
  if (f.systemId === homeId) {
    f.supportState = 'patrolling';
    return;
  }
  const q = quoteVoyage(d.galaxy.systems, f.systemId, homeId, totalShips(f), d.empire.fuel);
  if (q.ok) {
    depart(d, f, homeId, q.years!, q.fuelCost);
    f.supportState = 'returning';
  } else if (f.supportState !== 'idle') {
    d.log.push({ tick: d.tick, kind: 'warning', text: `${f.name} cannot get home (${q.reason}) — holding.` });
  }
  f.supportState = q.ok ? f.supportState : 'idle';
}

/** Patrol intercepts: weak hostile flotillas adjacent to the patrolled world. */
function patrolIntercepts(d: GameState, f: Fleet, target: System): void {
  const neighbors = gridNeighbors(d.galaxy.systems, target);
  for (const r of d.galaxy.factions) {
    if (r.kind !== 'rival' || r.fleet <= 0 || r.fleet > SUPPORT.weakFleetSize) continue;
    if (!neighbors.some((n) => n.ownerId === r.id)) continue;
    r.fleet = Math.max(0, r.fleet - SUPPORT.interceptLoss);
    d.log.push({
      tick: d.tick,
      kind: 'event',
      text: `${f.name} intercepts ${r.name}'s forward elements off ${target.name} (−${SUPPORT.interceptLoss} ship${SUPPORT.interceptLoss === 1 ? '' : 's'}).`,
    });
    emit(d, 'support.report', { mission: 'patrol', planetName: target.name, factionName: r.name });
  }
}

/**
 * Support fleets pipeline step (core §4 year-step 4, after flagship
 * movement, BEFORE rivals — patrol intercepts apply to this year's rival
 * attack gates). Mutates the draft.
 */
export function applySupportFleets(d: GameState): void {
  for (const f of d.supports) {
    // Arrivals resolve on the exact tick (same rule as the flagship), then
    // the fleet's state is re-evaluated in the same tick.
    if (f.travel !== null) {
      if (d.tick < f.travel.arriveTick) continue;
      f.systemId = f.travel.toId;
      f.travel = null;
      const dest = d.galaxy.systems.find((s) => s.id === f.systemId)!;
      d.log.push({ tick: d.tick, kind: 'info', text: `${f.name} arrives at ${dest.name}.` });
    }

    const homeId = f.homeId;
    const home = homeId ? sys(d, homeId) : undefined;
    if (!homeId || !home) {
      f.supportState = 'idle'; // home gone (C16 destruction) — idle, no rule bent
      continue;
    }

    // Critically damaged → return to safety when possible (core §7).
    if (f.hull < SUPPORT.criticalHull) {
      if (f.systemId === homeId) {
        f.supportState = 'idle'; // damaged at home: wait
      } else {
        travelTo(d, f, homeId, 'returning');
      }
      continue;
    }

    const m = f.mission;

    // Unassigned → patrol home (the Tier-0 fallback).
    if (!m) {
      if (f.systemId === homeId) f.supportState = 'patrolling';
      else travelTo(d, f, homeId, 'traveling');
      continue;
    }

    const t = sys(d, m.targetId);
    if (!t) {
      standDown(d, f, 'mission voided — the target no longer exists.');
      continue;
    }
    const v = missionTargetValid(d, m);
    if (!v.ok) {
      standDown(d, f, `mission voided — ${v.reason?.toLowerCase() ?? 'target lost'}.`);
      continue;
    }

    switch (m.type) {
      case 'scout': {
        if (f.systemId === t.id) {
          if (!t.explored) {
            t.explored = true; // the SAME reveal a flagship arrival makes
            d.log.push({
              tick: d.tick,
              kind: 'event',
              text: `${f.name} charts ${t.name}: ${t.starClass} star, defense ${t.defense}, ${t.ownerId === null ? 'unclaimed' : `${d.galaxy.factions.find((x) => x.id === t.ownerId)?.name ?? t.ownerId} territory`}${t.planet ? `, ${t.planet.development} development` : ', no planet'}.`,
            });
            emit(d, 'recon.reveal', { planetName: t.name });
          }
          emit(d, 'support.report', { mission: 'scout', planetName: t.name });
          standDown(d, f, 'recon complete.');
        } else {
          travelTo(d, f, t.id, 'scouting');
        }
        break;
      }
      case 'patrol': {
        if (f.systemId === t.id) {
          f.supportState = 'patrolling';
          patrolIntercepts(d, f, t);
        } else {
          travelTo(d, f, t.id, 'patrolling');
        }
        break;
      }
      case 'reinforce': {
        if (f.systemId === t.id && t.planet) {
          const rec = recommendedGarrison(t.planet, t, d.galaxy);
          const move = Math.min(f.troops, Math.max(0, rec - t.planet.garrison));
          if (move > 0) {
            t.planet.garrison += move;
            f.troops -= move;
            d.log.push({
              tick: d.tick,
              kind: 'event',
              text: `${f.name} delivers ${move} troops — the garrison of ${t.planet.name} stands at ${t.planet.garrison}.`,
            });
            emit(d, 'support.report', { mission: 'reinforce', planetName: t.planet.name });
          } else {
            d.log.push({ tick: d.tick, kind: 'info', text: `${f.name} finds ${t.name}'s garrison already at strength.` });
          }
          standDown(d, f, 'reinforcements delivered.');
        } else {
          travelTo(d, f, t.id, 'reinforcing');
        }
        break;
      }
      case 'defend': {
        if (f.systemId === t.id) {
          f.supportState = 'defending'; // defensive strength reads this state (combat.ts)
        } else {
          travelTo(d, f, t.id, 'defending');
        }
        break;
      }
    }
  }
}

/**
 * Defend support: the combat strength of every support fleet stationed in
 * the DEFENDING state at this system. Added to the world's defense by
 * defensiveStrength() (combat.ts) — the same derived strength a player
 * fleet would bring.
 */
export function defendingStrengthAt(d: GameState, systemId: string): number {
  let s = 0;
  for (const f of d.supports) {
    if (f.systemId === systemId && f.supportState === 'defending') s += combatStrength(f);
  }
  return s;
}
