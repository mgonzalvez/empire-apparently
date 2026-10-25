/**
 * Flagship construction & condition (C6; core §6, PLAN §8).
 *
 *  - Three classes: Interceptors (cheap, anti-ship), Cruisers (main
 *    strength), Transports (invasion capacity).
 *  - Construction is INSTANT (0 ticks) at shipyard systems — "a quick
 *    decision, not a prolonged queue-management task" (core §6).
 *  - Shipyard rule: a player-owned world with Fortress specialization or
 *    development ≥ FLEET.shipyardMinDev. (The dev-3 homeworld always is one.)
 *  - Hull 0..100; repair is exactly 1 year. A damaged fleet fights weakly:
 *    strength × (0.5 + 0.5 × hull/100) — a wreck still fights at half.
 *  - Combat & invasion strength are DERIVED (never stored) and always
 *    displayed (PLAN §8). C7 combat consumes these same values.
 */

import { FLEET } from '../data/balance';
import type { Fleet, FleetShips, GameState, ShipClass } from './types';

/** Total ships in a fleet (UI + C6 strength derivation). */
export function totalShips(fleet: { ships: FleetShips }): number {
  return fleet.ships.interceptor + fleet.ships.cruiser + fleet.ships.transport;
}

/** Troops a fleet can carry (capacity follows surviving transports). */
export function maxTroops(fleet: Fleet): number {
  return fleet.ships.transport * FLEET.troopsPerTransport;
}

/** Clamps troops to capacity (called after transports change, C7). */
export function clampTroops(fleet: Fleet): void {
  if (fleet.troops > maxTroops(fleet)) fleet.troops = maxTroops(fleet);
}

/** A damaged fleet fights weakly: ×(0.5 + 0.5×hull/100). */
export function hullFactor(hull: number): number {
  return 0.5 + 0.5 * (hull / 100);
}

/** Derived orbital combat strength (C7 uses exactly this). */
export function combatStrength(fleet: Fleet): number {
  const w = FLEET.combatWeight;
  const raw =
    (fleet.ships.interceptor * w.interceptor +
      fleet.ships.cruiser * w.cruiser +
      fleet.ships.transport * w.transport) *
    hullFactor(fleet.hull);
  return Math.floor(raw);
}

/** Derived invasion strength = troops aboard. */
export function invasionStrength(fleet: Fleet): number {
  return fleet.troops;
}

/** Shipyard rule: player-owned world, Fortress spec or development ≥ 3. */
export function isShipyard(state: GameState, systemId: string): boolean {
  const s = state.galaxy.systems.find((x) => x.id === systemId);
  if (!s || s.ownerId !== 'player' || s.planet === null) return false;
  return (
    s.planet.specialization === 'fortress' ||
    s.planet.development >= FLEET.shipyardMinDev
  );
}

export const buildCost = (ship: ShipClass): { credits: number; materials: number } => ({
  ...FLEET.cost[ship],
});

export const repairCost = (): { credits: number; materials: number } => ({
  ...FLEET.repairCost,
});

/** Cost to refill invasion troops to capacity (0 when full). */
export function rearmCost(fleet: Fleet): number {
  return (maxTroops(fleet) - fleet.troops) * FLEET.rearmCostPerTroop;
}

export interface Gate {
  ok: boolean;
  reason: string | null;
}

export function canBuild(state: GameState, ship: ShipClass): Gate {
  const f = state.flagship;
  if (!isShipyard(state, f.systemId)) {
    return {
      ok: false,
      reason: 'No shipyard here (needs a Fortress world or development III+).',
    };
  }
  const cost = buildCost(ship);
  if (state.empire.credits < cost.credits || state.empire.materials < cost.materials) {
    return {
      ok: false,
      reason: `Cannot afford a ${ship}: ${cost.credits}C / ${cost.materials}M.`,
    };
  }
  return { ok: true, reason: null };
}

export function canRepair(state: GameState): Gate {
  const f = state.flagship;
  if (f.hull >= 100) return { ok: false, reason: 'Hull is intact.' };
  const cost = repairCost();
  if (state.empire.credits < cost.credits) {
    return { ok: false, reason: `Repair costs ${cost.credits}C.` };
  }
  return { ok: true, reason: null };
}

export function canRearm(state: GameState): Gate {
  const f = state.flagship;
  if (!isShipyard(state, f.systemId)) {
    return { ok: false, reason: 'Troops board at shipyards.' };
  }
  if (f.troops >= maxTroops(f)) return { ok: false, reason: 'Troops are at full strength.' };
  const cost = rearmCost(f);
  if (state.empire.credits < cost) {
    return { ok: false, reason: `Rearm costs ${cost}C.` };
  }
  return { ok: true, reason: null };
}
