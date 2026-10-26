/**
 * Rival factions v2 (C11; core §3 "simple deterministic strategic rules",
 * core §11 "difficulty-dependent behavior and starting bonuses, not hidden
 * arbitrary cheating").
 *
 * Each rival takes AT MOST ONE action per year, in priority order:
 *  1. ATTACK — a grid-adjacent player world, when its fleet ≥ attackRatio ×
 *     the world's effective defense (orbital defense + garrison). At this
 *     ratio an attack always lands — the threat is telegraphed, never a
 *     coin flip. The flotilla takes losses (the stronger the margin, the
 *     smaller the share), so attacks pace themselves.
 *  2. EXPAND — a grid-adjacent unclaimed or independent system when
 *     own defense ≥ expandRatio × target defense (v1 behavior).
 *  3. REINFORCE — the weakest owned system toward its defense target.
 *  4. BUILD — the fleet grows by fleetBuildPerYear.
 *
 * Rivals never fight each other and never touch the player unless the
 * attack ratio says so. Every action is logged — no rival action is
 * invisible (core §14). The fleet is an abstract warship count: it is the
 * hook C13+ uses when player support fleets engage it.
 */

import { RIVAL, SUPPORT } from '../data/balance';
import { defensiveStrength } from './combat';
import { gridNeighbors } from './galaxy';
import { Rng } from './random';
import type { GameState, System } from './types';

const [VAR_LO, VAR_HI] = [0.9, 1.1]; // combat variance band (same as player battles)
const varianceDraw = (rng: Rng): number => VAR_LO + (VAR_HI - VAR_LO) * rng.next();

const defenseTarget = (s: System): number =>
  RIVAL.defenseTargetBase +
  (s.planet ? RIVAL.defenseTargetPerDev * s.planet.development : 0);

/**
 * Resolve a rival attack (the ratio gate guarantees a win; variance only
 * sizes the flotilla's losses). Mutates the draft. Returns the new fleet.
 */
function rivalAttack(d: GameState, attacker: string, target: System, rng: Rng): number {
  const r = d.galaxy.factions.find((f) => f.id === attacker)!;
  const A = r.fleet;
  const D = Math.max(1, defensiveStrength(target, d));
  const varA = varianceDraw(rng); // draw order matters (determinism)
  const varD = varianceDraw(rng);
  const Ae = A * varA;
  const De = D * varD;

  const lossFrac = Math.min(1, De / (Ae + De));
  let lost = Math.round(lossFrac * A);
  if (lost === 0 && lossFrac > 0.1) lost = 1;
  r.fleet = Math.max(0, A - lost);

  target.previousOwnerId = target.ownerId;
  target.ownerId = r.id;
  target.occupation = 'none';
  if (target.planet) {
    // The garrison disperses; the world's static defenses survive the change
    // of regime.
    target.planet.garrison = 0;
    target.planet.stability = 100;
    target.planet.integration = 0;
  }
  d.log.push({
    tick: d.tick,
    kind: 'warning',
    text: `${r.name} takes ${target.name} — flotilla ${A} against defense ${D}.`,
  });

  // C14: a support fleet defending this world breaks off the defense and
  // takes hull damage (it never invades, and it will limp home next year).
  for (const sf of d.supports) {
    if (sf.systemId === target.id && sf.supportState === 'defending') {
      sf.hull = Math.max(0, sf.hull - SUPPORT.defendHullDamage);
      sf.mission = null; // its world is gone — the order is void
      d.log.push({
        tick: d.tick,
        kind: 'warning',
        text: `${sf.name} breaks off the defense of ${target.name} (hull ${sf.hull}%).`,
      });
    }
  }
  return r.fleet;
}

/** Rivals pipeline stage (core §4 year-step 5). Mutates the draft. */
export function applyRivals(d: GameState, rng: Rng): void {
  const systems = d.galaxy.systems;
  for (const r of d.galaxy.factions) {
    if (r.kind !== 'rival') continue;
    const owned = systems.filter((s) => s.ownerId === r.id);
    let acted = false;

    // 1. ATTACK — nearest-neighbor player worlds the flotilla can take.
    //    Target value = development (tie: weaker defense, then canonical
    //    order). Distance is 1 by construction — rivals strike what is
    //    already next door (no long-range flights, C11 scope).
    if (!acted) {
      let pick: System | null = null;
      for (const s of owned) {
        for (const t of gridNeighbors(systems, s)) {
          if (t.ownerId !== 'player' || t.planet === null || t.destroyed) continue;
          if (r.fleet < RIVAL.attackRatio * defensiveStrength(t, d)) continue;
          if (
            pick === null ||
            t.planet.development > pick.planet!.development ||
            (t.planet.development === pick.planet!.development &&
              defensiveStrength(t, d) < defensiveStrength(pick, d))
          ) {
            pick = t;
          }
        }
      }
      if (pick) {
        rivalAttack(d, r.id, pick, rng);
        acted = true;
      }
    }

    // 2. EXPAND — first eligible (canonical order) favorable neighbor.
    if (!acted) {
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
    }

    // 3. REINFORCE the weakest owned system toward its target.
    if (!acted) {
      const weakest = [...owned].sort((a, b) => a.defense - b.defense)[0];
      if (weakest && weakest.defense < defenseTarget(weakest)) {
        weakest.defense += RIVAL.reinforcePerYear;
        d.log.push({
          tick: d.tick,
          kind: 'info',
          text: `${r.name} reinforces ${weakest.name} (defense +${RIVAL.reinforcePerYear}).`,
        });
        acted = true;
      }
    }

    // 4. BUILD — the flotilla grows (the idle rival), up to the cap.
    if (!acted && r.fleet < RIVAL.fleetCap) {
      r.fleet += RIVAL.fleetBuildPerYear;
      d.log.push({
        tick: d.tick,
        kind: 'info',
        text: `${r.name}'s flotilla grows to ${r.fleet}.`,
      });
    }
  }
}
