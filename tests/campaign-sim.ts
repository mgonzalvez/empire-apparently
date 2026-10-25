/**
 * Campaign simulation player (C8; PLAN P2) — the CRUISE profile: the
 * Tier-0 complexity floor. It wins using only TRAVEL and ATTACK for
 * conquest; maintenance (build / rearm / repair at the shipyard) is
 * mechanical upkeep, never a strategic choice. No support fleets, no
 * specialization management, no manual allocation, no combat tactics.
 *
 * Operating loop: shipyard → weakest reachable non-player world →
 * attack when the fight is winnable and a landing is possible →
 * shipyard → repeat. The profile is deliberately simple — it exists to
 * PROVE the Tier-0 floor (a mostly-automatic campaign is winnable), not
 * to win well. C12 sweeps it across seeds and adds the manual profile.
 */

import { buildCost, combatStrength, isShipyard, rearmCost, repairCost, totalShips } from '../src/engine/fleets';
import { planTravel } from '../src/engine/movement';
import { dispatchSim } from '../src/engine/simulation';
import type { GameState, ShipClass, System } from '../src/engine/types';

/** Mechanical upkeep thresholds (not strategy). */
const CRUISE = {
  troopsToHold: 10, // enough to garrison a development-3 world
  minShips: 3,
  maxShips: 6,
  cruisers: 2,
  hullToLeave: 80,
} as const;

export interface CruiseResult {
  game: GameState;
  ticks: number;
  ended: 'victory' | 'defeat' | 'aborted';
}

/** Play until the campaign ends or maxTicks (galactic years) elapse. */
export function playCruise(initial: GameState, maxTicks = 121): CruiseResult {
  let s = initial;
  let guard = 0;
  while (s.status === 'active' && s.tick <= maxTicks && guard++ < 10000) {
    s = cruiseStep(s);
  }
  return {
    game: s,
    ticks: s.tick,
    ended: s.status === 'active' ? 'aborted' : s.status,
  };
}

function cruiseStep(s: GameState): GameState {
  const f = s.flagship;
  const at = s.galaxy.systems.find((x) => x.id === f.systemId)!;

  // In transit: the voyage runs its course.
  if (f.travel) return dispatchSim(s, { type: 'WAIT' });

  // 1. Docked at a non-player world: attack when winnable, with lift.
  if (at.ownerId !== 'player' && at.planet !== null) {
    const hasLift = f.ships.transport > 0 && f.troops > 0;
    const combatants = f.ships.interceptor + f.ships.cruiser > 0;
    if (combatants && combatStrength(f) >= at.defense && hasLift) {
      return dispatchSim(s, { type: 'ATTACK', targetId: at.id, stance: 'aggressive' });
    }
    // Unwinnable or no lift: back to the nearest shipyard.
    const yard = nearestShipyard(s);
    if (yard) return dispatchSim(s, { type: 'TRAVEL', destinationId: yard.id });
    return dispatchSim(s, { type: 'WAIT' });
  }

  // 2. Docked at a player world.
  if (at.ownerId === 'player') {
    if (!isShipyard(s, at.id)) {
      // Return to base before sailing out again (rearm + build there).
      const yard = nearestShipyard(s);
      if (yard && yard.id !== at.id)
        return dispatchSim(s, { type: 'TRAVEL', destinationId: yard.id });
      return dispatchSim(s, { type: 'WAIT' });
    }
    // At the shipyard: mechanical upkeep.
    if (f.troops < CRUISE.troopsToHold && canAffordRearm(s))
      return dispatchSim(s, { type: 'REARM' });
    if (totalShips(f) < CRUISE.minShips && canAfford(s, 'interceptor'))
      return dispatchSim(s, { type: 'BUILD', ship: 'interceptor' });
    if (f.ships.transport === 0 && canAfford(s, 'transport'))
      return dispatchSim(s, { type: 'BUILD', ship: 'transport' });
    if (f.ships.cruiser < CRUISE.cruisers && canAfford(s, 'cruiser'))
      return dispatchSim(s, { type: 'BUILD', ship: 'cruiser' });
    if (f.hull < CRUISE.hullToLeave && canAffordRepair(s))
      return dispatchSim(s, { type: 'REPAIR' });
    // Otherwise fall through: ready to sail.
  }

  // 3. Sailing out: weakest reachable non-player world (never uninhabited).
  const targets = s.galaxy.systems.filter((t) =>
    t.id !== at.id &&
    t.ownerId !== 'player' &&
    t.planet !== null &&
    !t.destroyed &&
    planTravel(s, t.id).ok);
  if (targets.length > 0) {
    const years = (t: System) => planTravel(s, t.id).years ?? Infinity;
    const pick = [...targets].sort(
      (a, b) => a.defense - b.defense || years(a) - years(b),
    )[0];
    return dispatchSim(s, { type: 'TRAVEL', destinationId: pick.id });
  }

  // 4. Nothing reachable — wait (the empire handles itself).
  return dispatchSim(s, { type: 'WAIT' });
}

function nearestShipyard(s: GameState): System | null {
  const yards = s.galaxy.systems.filter(
    (x) => x.ownerId === 'player' && isShipyard(s, x.id),
  );
  if (yards.length === 0) return null;
  const years = (t: System) => planTravel(s, t.id).years ?? Infinity;
  return [...yards].sort((a, b) => years(a) - years(b))[0];
}

function canAfford(s: GameState, ship: ShipClass): boolean {
  const c = buildCost(ship);
  return s.empire.credits >= c.credits && s.empire.materials >= c.materials;
}
function canAffordRearm(s: GameState): boolean {
  return s.empire.credits >= rearmCost(s.flagship);
}
function canAffordRepair(s: GameState): boolean {
  return s.empire.credits >= repairCost().credits;
}
