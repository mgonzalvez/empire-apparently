/**
 * Automatic combat (C7; core §1 "fast automatic combat", PLAN §8).
 *
 * Model (all numbers in balance.ts COMBAT):
 *  - Effective strengths: A' = A × stance.attack × varA, D' = D × varD,
 *    var ∈ [0.9, 1.1] seeded from the sim RNG (one draw per side, in order).
 *  - Orbit won iff A' > D' (strict — the "orbital superiority" rule).
 *  - Ship-loss fraction = D'/(A'+D') × stance.taken (clamped 0..1):
 *    ~50% at parity, →0 as superiority grows, →1 when outmatched.
 *  - Lost ships are distributed across classes deterministically
 *    (largest fractional remainder first, interceptor → cruiser →
 *    transport tie order).
 *  - Troops are lost WITH their transports in the orbital phase.
 *  - Hull degrades by COMBAT.hullDamageFactor × the ship-loss fraction.
 *  - Invasion (only after a won orbit with surviving transports):
 *    troops vs garrison + bastion fortifications + development modifier.
 *    Lands iff troops ≥ ground defense; either way troop losses =
 *    G/(I+G) × troops.
 *  - Cautious stance: after a won orbit, a seeded 25% roll withdraws the
 *    fleet (orbit secured, no landing).
 *
 * Combat is a time-advancing action (core §4 "major planetary actions"):
 * one year elapses per battle, won or lost.
 */

import { COMBAT } from '../data/balance';
import { Rng } from './random';
import {
  clampTroops,
  combatStrength,
  invasionStrength,
} from './fleets';
import { recommendedGarrison } from './occupation';
import type { BattleReport, FleetShips, GameState, ShipClass, Stance, System } from './types';

export type { Stance };

export const STANCES: readonly Stance[] = ['aggressive', 'balanced', 'cautious'];

export const STANCE_LABEL: Record<Stance, string> = {
  aggressive: 'Aggressive',
  balanced: 'Balanced',
  cautious: 'Cautious',
};

/** Documented stance text (tooltips, handbook — C30 mirrors this). */
export const STANCE_NOTE: Record<Stance, string> = {
  aggressive: 'Attack ×1.25, damage taken ×0.85.',
  balanced: 'Attack ×1.0, damage taken ×1.0.',
  cautious: 'Attack ×0.85, damage taken ×1.2; 25% chance to withdraw after a won orbit.',
};

export interface Gate {
  ok: boolean;
  reason: string | null;
}

/** What the player may attack, and why not (same gate for UI and engine). */
export function canAttack(state: GameState, targetId: string): Gate {
  const f = state.flagship;
  if (f.travel !== null) return { ok: false, reason: 'The flagship is in transit.' };
  const target = state.galaxy.systems.find((s) => s.id === targetId);
  if (!target) return { ok: false, reason: 'Unknown system.' };
  if (f.systemId !== targetId) {
    return { ok: false, reason: 'The flagship must be in this system to attack.' };
  }
  if (target.ownerId === 'player') {
    return { ok: false, reason: 'That system is yours.' };
  }
  if (!target.planet) {
    return { ok: false, reason: 'Nothing there to fight.' };
  }
  if (combatStrength(f) <= 0) {
    return { ok: false, reason: 'No combat strength — the fleet is a wreck or gone.' };
  }
  return { ok: true, reason: null };
}

const [VAR_LO, VAR_HI] = COMBAT.variance;
const varianceDraw = (rng: Rng): number => VAR_LO + (VAR_HI - VAR_LO) * rng.next();

const CLASS_ORDER: ShipClass[] = ['interceptor', 'cruiser', 'transport'];

/**
 * Deterministic ship losses: total = round(frac × totalShips) (at least one
 * when frac > 0.1), distributed by largest fractional remainder, ties in
 * interceptor → cruiser → transport order, never exceeding a class's count.
 */
export function distributeLosses(ships: FleetShips, frac: number): FleetShips {
  const total = ships.interceptor + ships.cruiser + ships.transport;
  if (total === 0 || frac <= 0) return { interceptor: 0, cruiser: 0, transport: 0 };
  let totalLoss = Math.round(frac * total);
  if (totalLoss === 0 && frac > 0.1) totalLoss = 1;
  totalLoss = Math.min(total, totalLoss);

  const floors: Record<ShipClass, number> = { interceptor: 0, cruiser: 0, transport: 0 };
  const fracs: Record<ShipClass, number> = { interceptor: 0, cruiser: 0, transport: 0 };
  for (const c of CLASS_ORDER) {
    const raw = frac * ships[c];
    floors[c] = Math.min(ships[c], Math.floor(raw));
    fracs[c] = raw - Math.floor(raw);
  }
  let assigned = floors.interceptor + floors.cruiser + floors.transport;
  const remainders = [...CLASS_ORDER].sort((a, b) => {
    if (fracs[b] !== fracs[a]) return fracs[b] - fracs[a];
    return CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b);
  });
  for (const c of remainders) {
    if (assigned >= totalLoss) break;
    if (floors[c] < ships[c]) {
      floors[c] += 1;
      assigned += 1;
    }
  }
  return floors;
}

/** Ground defense (invasion phase): garrison + bastion + development. */
export function groundDefense(target: System): number {
  if (!target.planet) return 0;
  return (
    target.planet.garrison +
    (target.planet.type === 'bastion' ? COMBAT.bastionGroundBonus : 0) +
    target.planet.development * COMBAT.developmentPerLevel
  );
}

/**
 * Effective orbital defense (C11): the world's static defense PLUS its
 * garrison. Used by the RIVAL attack gate and the UI threat readout — a
 * garrisoned world is harder for a flotilla to take. (Player battles keep
 * the C7 contract: garrison fights in the invasion phase.)
 */
export function defensiveStrength(target: System): number {
  return target.defense + (target.planet?.garrison ?? 0);
}

/**
 * Resolve a battle against `targetId` (mutates the draft; called from
 * dispatchSim with the sim RNG threaded through). Returns the factual
 * report (stored on the state for the modal).
 */
export function resolveBattle(d: GameState, targetId: string, stance: Stance): BattleReport {
  const rng = new Rng(d.rng);
  const fleet = d.flagship;
  const target = d.galaxy.systems.find((s) => s.id === targetId)!;
  const mult = COMBAT.stances[stance];

  const A = combatStrength(fleet);
  const D = target.defense;
  const varA = varianceDraw(rng); // draw order matters (determinism)
  const varD = varianceDraw(rng);
  const Ae = A * mult.attack * varA;
  const De = Math.max(0.0001, D * varD);
  const orbitWon = Ae > De;

  // ── Orbital exchange ─────────────────────────────────────────────
  const lossFrac = Math.min(1, (De / (Ae + De)) * mult.taken);
  const shipsLost = distributeLosses(fleet.ships, lossFrac);
  const shipsAfter: FleetShips = {
    interceptor: fleet.ships.interceptor - shipsLost.interceptor,
    cruiser: fleet.ships.cruiser - shipsLost.cruiser,
    transport: fleet.ships.transport - shipsLost.transport,
  };
  const hullAfter = Math.max(
    0,
    Math.round(fleet.hull * (1 - COMBAT.hullDamageFactor * lossFrac)),
  );

  // Troops are lost with their transports.
  const troopsLostOrbital =
    shipsLost.transport > 0
      ? Math.round((shipsLost.transport / Math.max(1, fleet.ships.transport)) * fleet.troops)
      : 0;
  let troopsAfter = Math.max(0, fleet.troops - troopsLostOrbital);

  // ── Apply fleet losses (common to all outcomes) ───────────────────
  fleet.ships = shipsAfter;
  fleet.hull = hullAfter;
  fleet.troops = troopsAfter;
  clampTroops(fleet);

  let outcome: BattleReport['outcome'];
  let troopsLostInvasion = 0;
  let garrison: number | null = null;

  if (!orbitWon) {
    // The defense holds; it keeps a share of its orbital strength.
    target.defense = Math.round(D * (De / (Ae + De)));
    outcome = 'held';
    d.stats.battles += 1;
    d.stats.losses += 1;
  } else {
    // Orbit secured: the defender's orbital fleet is gone, but the ground
    // defenses keep a share (C12: captured worlds still cost something).
    target.defense = Math.max(0, Math.round(D * COMBAT.defensesSurviveFraction));
    d.stats.battles += 1;

    const withdrew = mult.withdrawChance > 0 && rng.chance(mult.withdrawChance);
    if (withdrew) {
      outcome = 'withdrawn';
    } else if (shipsAfter.transport === 0) {
      outcome = 'no-lift';
    } else {
      // ── Invasion phase ────────────────────────────────────────────
      const I = Math.max(invasionStrength(fleet), 1);
      const G = Math.max(groundDefense(target), 0);
      const troopsFrac = G / (I + Math.max(G, 1));
      troopsLostInvasion = Math.min(troopsAfter, Math.round(troopsFrac * I));
      troopsAfter = Math.max(0, troopsAfter - troopsLostInvasion);
      fleet.troops = troopsAfter;

      if (G === 0 || I >= G) {
        outcome = 'captured';
        target.previousOwnerId = target.ownerId;
        target.ownerId = 'player';
        target.occupation = 'occupied';
        if (target.planet) {
          // C10: the recommended garrison is assigned from surviving troops
          // (the world starts stable unless the fleet is troop-starved).
          garrison = Math.min(
            recommendedGarrison(target.planet, target, d.galaxy),
            troopsAfter,
          );
          target.planet.garrison = garrison;
          target.planet.stability = 100;
          target.planet.integration = 0;
        }
        fleet.troops = Math.max(0, troopsAfter - (garrison ?? 0));
        d.stats.wins += 1;
        d.stats.conquests += 1;
      } else {
        outcome = 'invasion-failed';
        d.stats.losses += 1;
      }
    }
  }

  if (shipsAfter.interceptor + shipsAfter.cruiser + shipsAfter.transport === 0) {
    d.stats.fleetsLost += 1;
  }

  const report: BattleReport = {
    tick: d.tick,
    targetId: target.id,
    targetName: target.name,
    stance,
    outcome,
    attackerStrength: Math.round(A * mult.attack),
    defenderStrength: D,
    lossFraction: Math.round(lossFrac * 1000) / 1000,
    shipsLost,
    shipsAfter,
    hullAfter,
    troopsLost: troopsLostOrbital + troopsLostInvasion,
    troopsAfter,
    defenseAfter: target.defense,
    garrison,
    captured: outcome === 'captured',
  };

  // ── Factual log (one line; the report modal carries the numbers) ────
  const lostText =
    shipsLost.interceptor + shipsLost.cruiser + shipsLost.transport > 0
      ? ` Lost ${shipsLost.interceptor} interceptor${shipsLost.interceptor === 1 ? '' : 's'}, ${shipsLost.cruiser} cruiser${shipsLost.cruiser === 1 ? '' : 's'}, ${shipsLost.transport} transport${shipsLost.transport === 1 ? '' : 's'}.`
      : '';
  const byOutcome: Record<BattleReport['outcome'], string> = {
    captured: `The fleet takes ${target.name} (garrison ${garrison}).`,
    held: `The defense of ${target.name} holds.`,
    'invasion-failed': `The orbit over ${target.name} is secured, but the ground holds.`,
    withdrawn: `The orbit over ${target.name} is secured; the fleet withdraws.`,
    'no-lift': `The orbit over ${target.name} is secured; no transports remain to land.`,
  };
  d.log.push({
    tick: d.tick,
    kind: 'combat',
    text: `Battle at ${target.name}: ${byOutcome[outcome]}${lostText}`,
  });
  if (report.troopsLost > 0) {
    d.log.push({
      tick: d.tick,
      kind: 'combat',
      text: `Casualties: ${report.troopsLost} troops (aboard transports or in the landing).`,
    });
  }
  if (shipsAfter.interceptor + shipsAfter.cruiser + shipsAfter.transport === 0) {
    d.log.push({
      tick: d.tick,
      kind: 'warning',
      text: `The ${fleet.name} is lost. Only a rebuild — from a shipyard — remains.`,
    });
  }

  d.lastBattle = report;
  d.rng = rng.state();
  return report;
}

/**
 * Rough pre-travel outcome estimate (core §6 travel preview, "if
 * applicable"). Factual ratio bands against KNOWN defenders only.
 */
export function estimateOutcome(
  state: GameState,
  destinationId: string,
): 'favorable' | 'even' | 'unfavorable' | 'unknown' {
  const dest = state.galaxy.systems.find((s) => s.id === destinationId);
  if (!dest || !dest.explored) return 'unknown';
  const A = combatStrength(state.flagship);
  if (A <= 0) return 'unfavorable';
  const ratio = A / Math.max(1, dest.defense);
  if (ratio >= 1.5) return 'favorable';
  if (ratio >= 0.8) return 'even';
  return 'unfavorable';
}
