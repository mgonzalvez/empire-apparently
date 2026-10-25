/**
 * Economy (C5; core §5): three global pools, planets produce automatically.
 *
 *   production per year = ECON.productionBySpec[specialization] × development
 *
 * No worker assignment, no sliders, no building tree (core §5). Planets the
 * player doesn't control produce for whoever does (rivals are abstract —
 * only the player's pool is simulated). The UI never requires inspecting
 * each planet: the EmpireBar shows totals + per-year income.
 *
 * C9 adds: automatic development (stage 2, capped, transparent cost) and
 * the free one-click specialization change.
 */

import { DEV, ECON } from '../data/balance';
import type { GameState, Planet, Resources, Specialization, System } from './types';

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

// ── Development (C9) ─────────────────────────────────────────────────────

/** Cost to advance a world one development level (null at the cap). */
export function developmentCost(
  dev: number,
): { credits: number; materials: number } | null {
  const c = (DEV.cost as Record<number, { credits: number; materials: number } | undefined>)[dev];
  return c ? { credits: c.credits, materials: c.materials } : null;
}

/**
 * Development pipeline stage (core §4 year-step 2): automatic progression.
 * Every player world below the cap pays its level cost from the global pool
 * (income was applied in step 1), canonical order, first come first served.
 * Worlds that can't pay simply wait — no action is ever required (PLAN §9:
 * Tier-2 control with the "keep current" fallback).
 */
export function applyDevelopment(d: GameState): void {
  for (const s of d.galaxy.systems) {
    if (s.ownerId !== 'player' || !s.planet || s.destroyed) continue;
    const cost = developmentCost(s.planet.development);
    if (!cost) continue; // at the cap
    if (d.empire.credits < cost.credits || d.empire.materials < cost.materials) continue;
    d.empire.credits -= cost.credits;
    d.empire.materials -= cost.materials;
    s.planet.development += 1;
    d.log.push({
      tick: d.tick,
      kind: 'economy',
      text: `${s.planet.name} develops to level ${devRoman(s.planet.development)}.`,
    });
  }
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
export function devRoman(dev: number): string {
  return ROMAN[Math.max(0, Math.min(4, dev - 1))];
}

// ── Specialization change (C9) ───────────────────────────────────────────

/**
 * One-click specialization change (core §9): free, instant (0 ticks — off
 * the time ledger, like BUILD/REARM), player worlds only. Changes next
 * year's income per the production table. No-op when unavailable.
 */
export function specialize(
  state: GameState,
  systemId: string,
  spec: Specialization,
): GameState {
  const s = state.galaxy.systems.find((x) => x.id === systemId);
  if (!s || s.ownerId !== 'player' || !s.planet) return state;
  if (s.planet.specialization === spec) return state;
  const d = structuredClone(state) as GameState;
  const t = d.galaxy.systems.find((x) => x.id === systemId)!;
  t.planet!.specialization = spec;
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `${t.planet!.name} is re-zoned as ${spec}.`,
  });
  return d;
}
