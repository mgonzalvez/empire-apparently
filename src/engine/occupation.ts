/**
 * Occupation (C8, extended C10; core §9, PLAN §8): captured worlds settle
 * into the player's empire automatically — no manual labor, ever.
 *
 * Recommended garrison (C10) = development + a threat bonus when a rival
 * faction is grid-adjacent. It is the amount assigned at capture and the
 * target of REINFORCE.
 *
 * Stability rule (C10, Tier-0 safe): a world settles (stability rises and
 * it integrates) while garrisoned; it is UNGARRISONED only when a rival is
 * grid-adjacent AND its garrison is 0. Development does not change the
 * requirement — no maintenance treadmill (PLAN P2: the cruise tier must
 * keep winning without occupation micro).
 *
 * Per player-occupied world, each year (core §4 year-step 3):
 *  - C10 Tier-0 fallback: stability < 40 AND under-garrisoned AND the
 *    flagship is docked here with spare troops → the garrison is topped up
 *    to recommended automatically (no command, no cost).
 *  - garrisoned → stability +10 AND integration += stability/100 × 50
 *    (rate ∝ stability), capped at 100
 *  - under-garrisoned → stability −20 and NO integration (a threatened,
 *    ungarrisoned world does not settle)
 *  - stability 0 while under-garrisoned → rebellion: the world secedes to
 *    its previous faction (or becomes unclaimed), garrison and integration
 *    reset
 *  - integration 100 → occupation 'integrated' (final; cannot rebel)
 *
 * The homeworld starts already integrated (newGame). C7 captures assign the
 * recommended garrison from surviving troops (combat.ts). The optional
 * REINFORCE action (C10, instant) does what the auto top-up does — but
 * proactively, before the world gets near the line.
 */

import { OCC } from '../data/balance';
import { gridNeighbors } from './galaxy';
import { emit } from './events';
import type { Galaxy, GameState, Planet, System } from './types';

/** True when a rival faction owns a grid-adjacent system (C10 threat). */
export function isThreatened(system: System, galaxy: Galaxy): boolean {
  const rivalIds = new Set(
    galaxy.factions.filter((f) => f.kind === 'rival').map((f) => f.id),
  );
  return gridNeighbors(galaxy.systems, system).some((n) =>
    n.ownerId !== null && rivalIds.has(n.ownerId),
  );
}

/**
 * Recommended garrison for a world (C10): development, +1 while a rival is
 * grid-adjacent. Assigned at capture; the REINFORCE / auto top-up target.
 */
export function recommendedGarrison(
  planet: Planet,
  system: System,
  galaxy: Galaxy,
): number {
  return (
    planet.development * OCC.garrisonPerDevelopment +
    (isThreatened(system, galaxy) ? OCC.rivalThreatBonus : 0)
  );
}

/**
 * The stability rule (C10): a world is garrisoned while no rival is
 * adjacent, or while it holds at least the threat bonus in garrison.
 */
export function isGarrisoned(
  planet: Planet,
  system: System,
  galaxy: Galaxy,
): boolean {
  const required = isThreatened(system, galaxy) ? OCC.rivalThreatBonus : 0;
  return planet.garrison >= required;
}

/** Occupation readout (PLAN §8) — derived, never stored. */
export type OccupationStatus = 'stable' | 'unstable' | 'imminent';

export function occupationStatus(
  garrisoned: boolean,
  stability: number,
): OccupationStatus {
  if (garrisoned) return 'stable';
  if (stability < OCC.autoTopUpBelowStability) return 'imminent';
  return 'unstable';
}

/**
 * Years until a GARRISONED world integrates, simulated with the exact stage
 * rules (so the estimate is exact, never off by more than rounding).
 * Null when the world is not garrisoned (it declines, it cannot settle).
 */
export function integrationEstimate(planet: Planet, garrisoned: boolean): number | null {
  if (!garrisoned) return null;
  let stability = planet.stability;
  let integration = planet.integration;
  let years = 0;
  while (integration < 100 && years < 60) {
    stability = Math.min(100, stability + OCC.stabilityRisePerYear);
    integration = Math.min(
      100,
      integration + Math.round((stability / 100) * OCC.integrationRatePerYear),
    );
    years += 1;
  }
  return integration >= 100 ? years : null;
}

/**
 * Occupation pipeline stage (core §4 year-step 3). Mutates the draft
 * (called inside runTick).
 */
export function applyOccupation(d: GameState): void {
  const galaxy = d.galaxy;
  const f = d.flagship;
  const flagshipDocked = (systemId: string) =>
    f.travel === null && f.systemId === systemId;

  for (const s of galaxy.systems) {
    if (s.ownerId !== 'player' || s.occupation !== 'occupied' || !s.planet) continue;
    const p = s.planet;
    const rec = recommendedGarrison(p, s, galaxy);
    let garrisoned = isGarrisoned(p, s, galaxy);

    // C10 Tier-0 fallback: below the line, a present flagship tops the
    // garrison up automatically — zero input required to avoid rebellion.
    if (!garrisoned && p.stability < OCC.autoTopUpBelowStability && flagshipDocked(s.id) && f.troops > 0) {
      const move = Math.min(rec - p.garrison, f.troops);
      p.garrison += move;
      f.troops -= move;
      garrisoned = p.garrison >= rec;
      d.log.push({
        tick: d.tick,
        kind: 'economy',
        text: `The garrison of ${p.name} is topped up to ${p.garrison}. Nobody was asked.`,
      });
    }

    if (garrisoned) {
      p.stability = Math.min(100, p.stability + OCC.stabilityRisePerYear);
      p.integration = Math.min(
        100,
        p.integration + Math.round((p.stability / 100) * OCC.integrationRatePerYear),
      );
      if (p.integration >= 100) {
        s.occupation = 'integrated';
        p.stability = 100;
        d.log.push({
          tick: d.tick,
          kind: 'event',
          text: `${p.name} is fully integrated. The paperwork is, for once, complete.`,
        });
        emit(d, 'planet.integrated', { planetName: p.name });
      }
    } else {
      p.stability = Math.max(0, p.stability - OCC.stabilityFallPerYear);
      if (p.stability === 0) {
        // Rebellion: secede to the previous faction, or unclaimed.
        const home = s.previousOwnerId;
        d.log.push({
          tick: d.tick,
          kind: 'warning',
          text: `${p.name} rebels — the garrison was too thin. The world secedes${home ? ` to ${galaxy.factions.find((x) => x.id === home)?.name ?? 'its old government'}` : ' and is unclaimed'}.`,
        });
        emit(d, 'occupation.rebellion', { planetName: p.name });
        s.ownerId = home;
        s.previousOwnerId = null;
        s.occupation = 'none';
        p.garrison = 0;
        p.stability = 100;
        p.integration = 0;
      } else if (p.stability < OCC.autoTopUpBelowStability) {
        // Imminent (C19): the world is one bad year from rebellion — the
        // advisor warns while there is still time to act.
        emit(d, 'occupation.unstable', { planetName: p.name });
      }
    }
  }
}
