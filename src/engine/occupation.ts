/**
 * Occupation (C8; core §9, PLAN §8): captured worlds settle into the
 * player's empire automatically — no manual labor, ever.
 *
 * Per player-occupied world, each year (core §4 year-step 3):
 *  - garrison ≥ recommended (development) → stability +10 AND integration
 *    += stability/100 × 50 (rate ∝ stability), capped at 100
 *  - garrison < recommended → stability −20 and NO integration (an
 *    abandoned world does not settle)
 *  - stability 0 while under-garrisoned → rebellion: the world secedes to
 *    its previous faction (or becomes unclaimed), garrison and integration
 *    reset
 *  - integration 100 → occupation 'integrated' (final; cannot rebel)
 *
 * The homeworld starts already integrated (newGame).
 * C10 adds: recommended-garrison refinement, auto top-up (Tier-0 fallback),
 * the optional Reinforce action, and the Stable/Unstable/Rebellion Imminent
 * readout with estimated integration time.
 */

import { OCC } from '../data/balance';
import type { GameState, Planet } from './types';

/** Recommended garrison for a world (C8: development; C10 refines). */
export function recommendedGarrison(planet: Planet): number {
  return planet.development * OCC.garrisonPerDevelopment;
}

/**
 * Occupation pipeline stage (core §4 year-step 3). Mutates the draft
 * (called inside runTick).
 */
export function applyOccupation(d: GameState): void {
  for (const s of d.galaxy.systems) {
    if (s.ownerId !== 'player' || s.occupation !== 'occupied' || !s.planet) continue;
    const p = s.planet;

    const garrisoned = p.garrison >= recommendedGarrison(p);

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
      }
    } else {
      p.stability = Math.max(0, p.stability - OCC.stabilityFallPerYear);
      if (p.stability === 0) {
        // Rebellion: secede to the previous faction, or unclaimed.
        const home = s.previousOwnerId;
        d.log.push({
          tick: d.tick,
          kind: 'warning',
          text: `${p.name} rebels — the garrison was too thin. The world secedes${home ? ` to ${d.galaxy.factions.find((f) => f.id === home)?.name ?? 'its old government'}` : ' and is unclaimed'}.`,
        });
        s.ownerId = home;
        s.previousOwnerId = null;
        s.occupation = 'none';
        p.garrison = 0;
        p.stability = 100;
        p.integration = 0;
      }
    }
  }
}
