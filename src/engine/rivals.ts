/**
 * Rival factions v1 (C8; core §3 "two or three simple rival factions",
 * PLAN §8). One action per rival per year (the v1 budget — C11 formalizes
 * it with strength-distance-value rules and full logging):
 *  1. Expand: take a grid-adjacent unclaimed or independent system when
 *     own defense ≥ expandRatio × target defense.
 *  2. Otherwise reinforce the weakest owned system (+1/yr toward its
 *     defense target).
 *
 * Rivals never touch player worlds in v1 (they become active in C11) and
 * never fight each other. Every expansion is logged — rival actions are
 * visible (core §14: no cheating).
 */

import { RIVAL } from '../data/balance';
import { gridNeighbors } from './galaxy';
import type { GameState, System } from './types';

const defenseTarget = (s: System): number =>
  RIVAL.defenseTargetBase +
  (s.planet ? RIVAL.defenseTargetPerDev * s.planet.development : 0);

/** Rivals pipeline stage (core §4 year-step 5). Mutates the draft. */
export function applyRivals(d: GameState): void {
  const systems = d.galaxy.systems;
  for (const r of d.galaxy.factions) {
    if (r.kind !== 'rival') continue;
    const owned = systems.filter((s) => s.ownerId === r.id);
    let acted = false;

    // 1. Expand — first eligible (canonical order) favorable neighbor.
    for (const s of owned) {
      if (acted) break;
      const targets = gridNeighbors(systems, s).filter(
        (t) =>
          (t.ownerId === null || t.ownerId.startsWith('ind-')) &&
          !t.destroyed,
      );
      const pick = targets.find(
        (t) => s.defense >= RIVAL.expandRatio * Math.max(1, t.defense),
      );
      if (!pick) continue;
      pick.previousOwnerId = pick.ownerId;
      pick.ownerId = r.id;
      pick.occupation = 'none';
      if (pick.planet) {
        // The old garrison (if any) disperses.
        pick.planet.garrison = 0;
        pick.planet.stability = 100;
        pick.planet.integration = 0;
      }
      d.log.push({
        tick: d.tick,
        kind: 'event',
        text: `${r.name} takes ${pick.name}.`,
      });
      acted = true;
    }

    // 2. Reinforce the weakest owned system toward its target.
    if (!acted) {
      const weakest = [...owned].sort((a, b) => a.defense - b.defense)[0];
      if (weakest && weakest.defense < defenseTarget(weakest)) {
        weakest.defense += RIVAL.reinforcePerYear;
      }
    }
  }
}
