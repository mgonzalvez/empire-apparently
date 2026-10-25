/**
 * Movement (C4; core §6): distance bands, fuel costs, jump range, voyage
 * quoting, and arrival resolution.
 *
 * Design (core §4 + §6):
 *  - Travel is a time-advancing action. Setting course departs AND advances
 *    one year (the departure year); the voyage then completes on its exact
 *    arrival tick during later time advancement. Multi-year voyages are
 *    therefore visible in transit between actions.
 *  - Fuel cost = fleet size × band fuelPerShip (core §6: "travel costs
 *    based on fleet size and distance"), paid at departure.
 *  - The flagship cannot travel beyond MAX_JUMP_RANGE — no hidden
 *    teleportation, ever.
 *  - Arriving reveals the destination (the map learns what the fleet sees).
 */

import { MAX_JUMP_RANGE, MOVE, type MoveBand } from '../data/balance';
import { totalShips } from './fleets';
import type { Fleet, GameState, System } from './types';

/** Straight-line map distance (map units, 1 decimal for display stability). */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10;
}

/** First band that covers the distance, or null when out of range. */
export function bandForDistance(dist: number): MoveBand | null {
  for (const band of MOVE.bands) {
    if (dist <= band.maxDistance) return band;
  }
  return null;
}

export interface TravelQuote {
  ok: boolean;
  /** Human-readable rejection reason (UI shows it; dispatch also guards). */
  reason: string | null;
  destinationId: string;
  /** Rounded to 1 decimal (also the value used for band selection). */
  distance: number;
  bandName: string | null;
  years: number | null;
  fuelCost: number;
  /** True when the destination is explored (defenders are known). */
  defendersKnown: boolean;
  defense: number | null;
  ownerId: string | null;
  /** True while the flagship is already under way (blocks new orders). */
  inTransit: boolean;
}

/**
 * Quote a voyage (pure; used by the dialog AND by dispatch — one source of
 * truth, so what the player is shown is exactly what gets simulated).
 */
export function planTravel(state: GameState, destinationId: string): TravelQuote {
  const fleet = state.flagship;
  const dest = state.galaxy.systems.find((s) => s.id === destinationId);
  const base: Omit<TravelQuote, 'ok' | 'reason'> = {
    destinationId,
    distance: 0,
    bandName: null,
    years: null,
    fuelCost: 0,
    defendersKnown: false,
    defense: null,
    ownerId: null,
    inTransit: fleet.travel !== null,
  };
  if (!dest) return { ...base, ok: false, reason: 'Unknown destination.' };

  if (fleet.travel !== null) {
    return {
      ...base,
      ok: false,
      reason: `The flagship is in transit (arrives year ${fleet.travel.arriveTick}).`,
    };
  }
  if (dest.id === fleet.systemId) {
    return { ...base, ok: false, reason: `The flagship is already at ${dest.name}.` };
  }

  const dist = distance(dest, state.galaxy.systems.find((s) => s.id === fleet.systemId)!);
  const band = bandForDistance(dist);
  if (band === null) {
    return {
      ...base,
      distance: dist,
      ok: false,
      reason: `Out of range: ${dist} units — max jump ${MAX_JUMP_RANGE}. Travel in stages.`,
    };
  }

  const fuelCost = totalShips(fleet) * band.fuelPerShip;
  if (state.empire.fuel < fuelCost) {
    return {
      ...base,
      distance: dist,
      bandName: band.name,
      years: band.years,
      fuelCost,
      ok: false,
      reason: `Insufficient fuel: the voyage costs ${fuelCost}, the tank holds ${Math.floor(state.empire.fuel)}.`,
    };
  }

  return {
    ...base,
    distance: dist,
    bandName: band.name,
    years: band.years,
    fuelCost,
    defendersKnown: dest.explored,
    defense: dest.explored ? dest.defense : null,
    ownerId: dest.ownerId,
    ok: true,
    reason: null,
  };
}

/**
 * Fleets pipeline stage (core §4 year-step 4): resolve the flagship voyage
 * on its exact arrival tick. Mutates the draft (called inside runTick).
 */
export function resolveFleetMovement(d: GameState): void {
  const f = d.flagship;
  if (f.travel === null || d.tick < f.travel.arriveTick) return;
  const dest = d.galaxy.systems.find((s) => s.id === f.travel!.toId);
  if (!dest) return; // unreachable: toId is always a valid system id
  f.systemId = dest.id;
  f.travel = null;
  f.orders = { type: 'hold', targetId: null };
  d.log.push({ tick: d.tick, kind: 'info', text: `${f.name} arrives at ${dest.name}.` });
  if (!dest.explored) {
    dest.explored = true;
    d.log.push({
      tick: d.tick,
      kind: 'info',
      text: dest.planet
        ? `Reconnaissance: ${dest.planet.name}, a ${dest.planet.type} world (development ${dest.planet.development}, defense ${dest.defense}).`
        : 'Reconnaissance: an uninhabited star.',
    });
  }
}

/**
 * Interpolated map position of a voyage (UI + tests). Progress is 0 just
 * after departure and 1 at the arrival tick.
 */
export function inTransitPosition(
  fleet: Fleet,
  from: System,
  to: System,
  tick: number,
): { x: number; y: number; progress: number } | null {
  if (fleet.travel === null) return null;
  const total = fleet.travel.arriveTick - fleet.travel.departTick;
  const progress =
    total > 0 ? Math.min(1, Math.max(0, (tick - fleet.travel.departTick) / total)) : 0;
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    progress,
  };
}
