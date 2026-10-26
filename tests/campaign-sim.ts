/**
 * Campaign simulation players (C8 cruise; C12 engaged; PLAN §14).
 *
 * CRUISE (Tier 0): the complexity floor — travel + attack + mechanical
 * upkeep only. It proves the Tier-0 floor: a mostly-automatic campaign is
 * winnable with no strategic choices at all.
 *
 * ENGAGED (Tier 1–2, C12): same upkeep, but it picks the best
 * value-per-defense target and chooses stance by odds. It must win at
 * least as well as cruise (PLAN §14).
 *
 * Both are headless and deterministic: they only call dispatchSim.
 */

import { CAMPAIGN } from '../src/data/balance';
import { buildCost, canRearm, combatStrength, isShipyard, rearmCost, repairCost, totalShips } from '../src/engine/fleets';
import { planTravel } from '../src/engine/movement';
import { dispatchSim } from '../src/engine/simulation';
import type { GameState, ShipClass, System } from '../src/engine/types';

/** Mechanical upkeep thresholds (not strategy). */
/** C12: attack/leave only at 1.3× odds — cheap fights beat attrition (56% → 78% at 1.0×). */
const ATTACK_ODDS = 1.3;

const CRUISE = {
  troopsToHold: 10, // enough to garrison a development-3 world
  minShips: 5, // tuned C12: 3 ships cannot keep pace with three flotillas
  maxShips: 6,
  cruisers: 2,
  hullToLeave: 80,
  hullToRepairFirst: 40, // a hull this low is a 44% strength tax — repair before anything else
} as const;

export type ProfileName = 'cruise' | 'engaged';

export interface CruiseResult {
  game: GameState;
  ticks: number;
  ended: 'victory' | 'defeat' | 'aborted';
}

/** Play until the campaign ends or maxTicks (galactic years) elapse.
 *  onTick observes each new state (C12 metrics: decision budget, etc.). */
export function playProfile(
  initial: GameState,
  profile: ProfileName,
  maxTicks = CAMPAIGN.deadlineYears + 1,
  onTick?: (s: GameState, tick: number) => void,
): CruiseResult {
  let s = initial;
  let guard = 0;
  const step = profile === 'cruise' ? cruiseStep : engagedStep;
  while (s.status === 'active' && s.tick <= maxTicks && guard++ < 10000) {
    s = step(s);
    onTick?.(s, s.tick);
  }
  return {
    game: s,
    ticks: s.tick,
    ended: s.status === 'active' ? 'aborted' : s.status,
  };
}

/** C8 API (fixture tests): the cruise profile. */
export function playCruise(initial: GameState, maxTicks = CAMPAIGN.deadlineYears + 1): CruiseResult {
  return playProfile(initial, 'cruise', maxTicks);
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
    if (combatants && combatStrength(f) >= at.defense * ATTACK_ODDS && hasLift) {
      return dispatchSim(s, { type: 'ATTACK', targetId: at.id, stance: 'aggressive' });
    }
    // Unwinnable or no lift: back to the nearest shipyard.
    const yard = nearestShipyard(s);
    if (yard) return dispatchSim(s, { type: 'TRAVEL', destinationId: yard.id });
    return dispatchSim(s, { type: 'WAIT' });
  }

  // 2. Docked at a player world: shipyard upkeep, then head out.
  s = upkeep(s, at);
  if (f.travel) return s;

  // 3. Sailing out: weakest reachable non-player world (never uninhabited).
  //    Leave only when the fight is winnable — otherwise keep building.
  const pick = pickTarget(s, at.id, 'weakest');
  if (pick) {
    if (combatStrength(s.flagship) >= pick.defense * ATTACK_ODDS)
      return dispatchSim(s, { type: 'TRAVEL', destinationId: pick.id });
    if (isShipyard(s, at.id) && canAfford(s, 'interceptor'))
      return dispatchSim(s, { type: 'BUILD', ship: 'interceptor' });
  }

  // 4. Nothing reachable — wait (the empire handles itself).
  return dispatchSim(s, { type: 'WAIT' });
}

function engagedStep(s: GameState): GameState {
  const f = s.flagship;
  const at = s.galaxy.systems.find((x) => x.id === f.systemId)!;

  if (f.travel) return dispatchSim(s, { type: 'WAIT' });

  // 1. Docked at a non-player world: attack when winnable. Aggressive is the
  //    correct stance at the winnable gate (×1.25 attack, ×0.85 damage, and it
  //    never loses the orbit it wins) — no coin flips against the clock.
  if (at.ownerId !== 'player' && at.planet !== null) {
    const hasLift = f.ships.transport > 0 && f.troops > 0;
    const combatants = f.ships.interceptor + f.ships.cruiser > 0;
    if (combatants && combatStrength(f) >= at.defense * ATTACK_ODDS && hasLift) {
      return dispatchSim(s, { type: 'ATTACK', targetId: at.id, stance: 'aggressive' });
    }
    const yard = nearestShipyard(s);
    if (yard) return dispatchSim(s, { type: 'TRAVEL', destinationId: yard.id });
    return dispatchSim(s, { type: 'WAIT' });
  }

  // 2. Shipyard upkeep, then head out.
  s = upkeep(s, at);
  if (f.travel) return s;

  // 3. Weakest reachable target — when the fleet is ready.
  //    Tier-1 touch (C12): recapture stolen player worlds before new conquests.
  const stolen = s.galaxy.systems
    .filter(
      (t) =>
        t.id !== f.systemId &&
        t.ownerId !== 'player' &&
        t.previousOwnerId === 'player' &&
        t.planet !== null &&
        !t.destroyed &&
        planTravel(s, t.id).ok,
    )
    .sort((a, b) => a.defense - b.defense)[0];
  const pick = stolen ?? pickTarget(s, f.systemId, 'weakest');
  if (pick) {
    if (combatStrength(s.flagship) >= pick.defense * ATTACK_ODDS)
      return dispatchSim(s, { type: 'TRAVEL', destinationId: pick.id });
    if (isShipyard(s, f.systemId) && canAfford(s, 'interceptor'))
      return dispatchSim(s, { type: 'BUILD', ship: 'interceptor' });
  }

  return dispatchSim(s, { type: 'WAIT' });
}

/** Mechanical shipyard upkeep (shared by both profiles). */
function upkeep(s: GameState, at: System): GameState {
  const f = s.flagship;
  if (at.ownerId !== 'player') return s;
  if (!isShipyard(s, at.id)) {
    const yard = nearestShipyard(s);
    if (yard && yard.id !== at.id) return dispatchSim(s, { type: 'TRAVEL', destinationId: yard.id });
    return s;
  }
  if (f.hull < CRUISE.hullToRepairFirst && canAffordRepair(s))
    return dispatchSim(s, { type: 'REPAIR' });
  if (
    f.troops < CRUISE.troopsToHold &&
    canRearm(s).ok && // no-op when the fleet has no transport to load — don't block the build
    canAffordRearm(s)
  )
    return dispatchSim(s, { type: 'REARM' });
  if (totalShips(f) < CRUISE.minShips && canAfford(s, 'interceptor'))
    return dispatchSim(s, { type: 'BUILD', ship: 'interceptor' });
  if (f.ships.transport === 0 && canAfford(s, 'transport'))
    return dispatchSim(s, { type: 'BUILD', ship: 'transport' });
  if (f.ships.cruiser < CRUISE.cruisers && canAfford(s, 'cruiser'))
    return dispatchSim(s, { type: 'BUILD', ship: 'cruiser' });
  if (f.hull < CRUISE.hullToLeave && canAffordRepair(s))
    return dispatchSim(s, { type: 'REPAIR' });
  return s;
}

/**
 * Target selection. 'weakest' = cruise (lowest defense, tie: closest).
 * 'value' = engaged (best development per unit of defense, tie: closest).
 */
function pickTarget(s: GameState, fromId: string, mode: 'weakest' | 'value'): System | null {
  const targets = s.galaxy.systems.filter((t) =>
    t.id !== fromId &&
    t.ownerId !== 'player' &&
    t.planet !== null &&
    !t.destroyed &&
    planTravel(s, t.id).ok);
  if (targets.length === 0) return null;
  const years = (t: System) => planTravel(s, t.id).years ?? Infinity;
  const score = (t: System) =>
    mode === 'weakest'
      ? [t.defense, 0, years(t)]
      : [t.defense / Math.max(1, t.planet!.development), t.defense, years(t)];
  return [...targets].sort((a, b) =>
    score(a)[0] - score(b)[0] || score(a)[1] - score(b)[1] || score(a)[2] - score(b)[2],
  )[0];
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
