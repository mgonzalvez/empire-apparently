/**
 * Economy (C5; core §5): three global pools, planets produce automatically.
 *
 *   production per year = ECON.productionBySpec[specialization] × development
 *
 * No worker assignment, no sliders, no building tree (core §5). Planets the
 * player doesn't control produce for whoever does (rivals are abstract —
 * only the player's pool is simulated). The UI never requires inspecting
 * each planet: the EmpireBar shows totals + per-year income.
 */

import { ECON } from '../data/balance';
import type { GameState, Planet, Resources, System } from './types';

/** One planet's per-year production (PLAN §8 table × development). */
export function productionOf(planet: Planet): Resources {
  const base = ECON.productionBySpec[planet.specialization];
  return {
    credits: base.credits * planet.development,
    materials: base.materials * planet.development,
    fuel: base.fuel * planet.development,
  };
}

/** Per-year income of one faction: the table sum over its inhabited systems. */
export function empireIncome(systems: System[], ownerId: string = 'player'): Resources {
  const out: Resources = { credits: 0, materials: 0, fuel: 0 };
  for (const s of systems) {
    if (s.ownerId !== ownerId || s.planet === null || s.destroyed) continue;
    const p = productionOf(s.planet);
    out.credits += p.credits;
    out.materials += p.materials;
    out.fuel += p.fuel;
  }
  return out;
}

/**
 * Resources pipeline stage (core §4 year-step 1): produce planetary
 * resources. Mutates the draft (called inside runTick).
 */
export function applyIncome(d: GameState): void {
  const inc = empireIncome(d.galaxy.systems, 'player');
  d.empire.credits += inc.credits;
  d.empire.materials += inc.materials;
  d.empire.fuel += inc.fuel;
}
