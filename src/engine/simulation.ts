/**
 * Engine core (C3): game state factory, the action ledger, and the
 * fixed-order tick pipeline.
 *
 * Time model (core §4):
 *  - Time advances ONLY through actions listed in `TIME_ADVANCING_ACTIONS`.
 *    Simple UI interactions (selecting systems, opening panels) never do.
 *  - Each year runs the seven pipeline stages in canonical order, so every
 *    system uses the same galactic clock and later stages observe earlier
 *    stages' results.
 */

import { hashSeed, Rng } from './random';
import { generateGalaxy } from './galaxy';
import { resolveFleetMovement, planTravel } from './movement';
import { applyDevelopment, applyIncome, specialize } from './economy';
import { buildCost, canBuild, canRearm, canRepair, clampTroops, combatStrength, maxTroops, rearmCost, repairCost } from './fleets';
import { canAttack, resolveBattle } from './combat';
import { applyOccupation } from './occupation';
import { applyRivals } from './rivals';
import { evaluateWinLose } from './victory';
import { CAMPAIGN, FLEET, GALAXY } from '../data/balance';
import type { GameState, ShipClass, Specialization, Stance } from './types';

// ── New game ─────────────────────────────────────────────────────────────

export interface NewGameOptions {
  supernovaFrequency?: 'zero' | 'low' | 'normal';
}

export function newGame(seed: number, opts: NewGameOptions = {}): GameState {
  const frequency = opts.supernovaFrequency ?? GALAXY.supernova.defaultFrequency;
  const galaxy = generateGalaxy(seed, { supernovaFrequency: frequency });
  // The homeworld is the player's from the start — fully integrated.
  const homeworld = galaxy.systems.find((s) => s.id === galaxy.homeworldId)!;
  homeworld.occupation = 'integrated';
  if (homeworld.planet) homeworld.planet.integration = 100;
  return {
    v: 1,
    seed,
    tick: 0,
    // Independent streams derived from the seed (PLAN §7): the sim RNG and
    // the narration RNG never share draws.
    rng: new Rng(hashSeed(`sim:${seed}`)).state(),
    narrRng: new Rng(hashSeed(`narr:${seed}`)).state(),
    galaxy,
    empire: { ...CAMPAIGN.startingResources },
    flagship: {
      id: 'flagship',
      name: 'The Modest Escort',
      systemId: galaxy.homeworldId,
      ships: { ...CAMPAIGN.startingFleetShips },
      hull: 100,
      troops: CAMPAIGN.startingFleetShips.transport * FLEET.troopsPerTransport,
      orders: { type: 'hold', targetId: null },
      travel: null,
    },
    supports: [],
    rivals: [],
    narrative: { resolvedIds: [], cooldowns: {} },
    tutorial: null,
    dialogue: { advisor: 'mort', recentIds: [], shown: {} },
    settings: {
      hints: 'normal',
      supernovaFreq: frequency,
      advisor: 'mort',
      sound: false,
      theme: 'system',
    },
    stats: {
      battles: 0,
      wins: 0,
      losses: 0,
      fleetsLost: 0,
      supernovas: 0,
      conquests: 0,
    },
    status: 'active',
    defeatReason: null,
    lastBattle: null,
    log: [
      {
        tick: 0,
        kind: 'info',
        text: 'Mandate accepted. You appear to be in charge. The auditors have already asked how.',
      },
    ],
  };
}

// ── Tick pipeline (core §4 — fixed order, one galactic clock) ────────────

export type StageName =
  | 'resources'
  | 'development'
  | 'occupation'
  | 'fleets'
  | 'rivals'
  | 'stars'
  | 'winLose';

/** Canonical yearly order (core §4, "During each year", 1–7). */
export const STAGE_ORDER: readonly StageName[] = [
  'resources',
  'development',
  'occupation',
  'fleets',
  'rivals',
  'stars',
  'winLose',
];

export type StageFn = (draft: GameState, rng: Rng, year: number) => void;

const stageFns: Record<StageName, StageFn> = {
  /** 1. Produce planetary resources. */
  resources: (d) => applyIncome(d),
  /** 2. Progress automatic development. */
  development: (d) => applyDevelopment(d),
  /** 3. Advance occupation stability. */
  occupation: (d) => applyOccupation(d),
  /** 4. Process fleet missions and arrivals. — C13/C14 support fleets. */
  fleets: (d) => resolveFleetMovement(d),
  /** 5. Process rival faction decisions. — C11 formalizes the budget. */
  rivals: (d) => applyRivals(d),
  /** 6. Advance stellar instability and events. — C15/C16, C29. */
  stars: () => {},
  /** 7. Evaluate victory and defeat. */
  winLose: (d) => evaluateWinLose(d),
};

export interface TickOptions {
  /** Test/inspection hook: override individual stages (others keep defaults). */
  stages?: Partial<Record<StageName, StageFn>>;
  /** Observation hook: called with each stage name, in execution order. */
  trace?: (stage: StageName) => void;
}

/** Simulate exactly one galactic year (core §4). Pure: returns new state. */
export function runTick(state: GameState, opts: TickOptions = {}): GameState {
  if (state.status !== 'active') return state;
  const d = structuredClone(state) as GameState;
  const rng = new Rng(d.rng);
  d.tick += 1;
  for (const name of STAGE_ORDER) {
    opts.trace?.(name);
    (opts.stages?.[name] ?? stageFns[name])(d, rng, d.tick);
  }
  d.rng = rng.state();
  if (d.log.length > CAMPAIGN.maxLogEntries) {
    d.log.splice(0, d.log.length - CAMPAIGN.maxLogEntries);
  }
  return d;
}

/** Simulate N consecutive years ("simulate every elapsed year in sequence"). */
export function runYears(state: GameState, years: number): GameState {
  let s = state;
  for (let i = 0; i < years; i++) s = runTick(s);
  return s;
}

// ── Action ledger (core §4) ──────────────────────────────────────────────

/**
 * The ONLY actions that advance time (core §4: travel, waiting, repair,
 * major planetary actions). Each future action is added here when it ships,
 * with tests — so nothing can advance time without being on this list.
 */
export type SimAction =
  | { type: 'WAIT'; years?: number }
  | { type: 'TRAVEL'; destinationId: string }
  | { type: 'REPAIR' } // exactly 1 year (time-advancing)
  | { type: 'ATTACK'; targetId: string; stance: Stance } // exactly 1 year (time-advancing)
  | { type: 'BUILD'; ship: ShipClass } // instant, 0 ticks
  | { type: 'REARM' } // instant, 0 ticks
  | { type: 'SPECIALIZE'; systemId: string; specialization: Specialization }; // instant, 0 ticks (C9)

/**
 * The ONLY actions that advance time (core §4: travel, waiting, repair,
 * major planetary actions). Building and rearming are instant (C6) — they
 * change state but never the clock. Each future action is added here when
 * it ships, with tests.
 */export const TIME_ADVANCING_ACTIONS: ReadonlySet<SimAction['type']> = new Set([
  'WAIT',
  'TRAVEL',
  'REPAIR',
  'ATTACK',
]);

/** Pure dispatch: action → next state. Terminal campaigns are frozen. */
export function dispatchSim(state: GameState, action: SimAction): GameState {
  if (state.status !== 'active') return state;
  // Time-advancing actions must be on the ledger (core §4).
  if (TIME_ADVANCING_ACTIONS.has(action.type)) {
    switch (action.type) {
      case 'WAIT':
        return runYears(state, Math.max(1, Math.min(action.years ?? 1, 999)));
      case 'TRAVEL':
        return beginTravel(state, action.destinationId);
      case 'REPAIR':
        return beginRepair(state);
      case 'ATTACK':
        return beginAttack(state, action.targetId, action.stance);
    }
  }
  switch (action.type) {
    case 'BUILD':
      return buildShip(state, action.ship);
    case 'REARM':
      return rearm(state);
    case 'SPECIALIZE':
      return specialize(state, action.systemId, action.specialization);
    default:
      // Unknown/unlisted actions never change anything (core §4).
      return state;
  }
}

/**
 * TRAVEL (core §4: travel advances time; core §6: fuel by fleet size +
 * distance). Quote first — what the player saw is what gets simulated. On
 * success: pay fuel, set the voyage, advance the departure year (1); the
 * voyage resolves on its exact arrival tick in the fleets stage.
 */
function beginTravel(state: GameState, destinationId: string): GameState {
  const quote = planTravel(state, destinationId);
  if (!quote.ok) return state;
  const d = structuredClone(state) as GameState;
  const dest = d.galaxy.systems.find((s) => s.id === destinationId)!;
  d.empire.fuel -= quote.fuelCost;
  d.flagship.travel = {
    fromId: d.flagship.systemId,
    toId: destinationId,
    departTick: d.tick,
    arriveTick: d.tick + (quote.years ?? 1),
  };
  d.flagship.orders = { type: 'travel', targetId: destinationId };
  d.log.push({
    tick: d.tick,
    kind: 'info',
    text: `${d.flagship.name} sets course for ${dest.explored ? dest.name : 'the uncharted system'} (${quote.bandName}, ${quote.fuelCost} fuel).`,
  });
  return runYears(d, 1);
}

/**
 * REPAIR (core §4: repair advances time; PLAN §8: repair 1 year). Pay the
 * cost, restore the hull, advance exactly one year.
 */
function beginRepair(state: GameState): GameState {
  if (!canRepair(state).ok) return state;
  const d = structuredClone(state) as GameState;
  d.empire.credits -= repairCost().credits;
  d.flagship.hull = 100;
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `Dockyards restore the ${d.flagship.name}'s hull to full.`,
  });
  return runYears(d, 1);
}

/**
 * BUILD (core §6: instant construction at shipyards). No time passes —
 * the clock only moves for travel, waiting, and repair (core §4).
 */
function buildShip(state: GameState, ship: ShipClass): GameState {
  if (!canBuild(state, ship).ok) return state;
  const d = structuredClone(state) as GameState;
  const cost = buildCost(ship);
  d.empire.credits -= cost.credits;
  d.empire.materials -= cost.materials;
  d.flagship.ships[ship] += 1;
  clampTroops(d.flagship);
  const at = d.galaxy.systems.find((s) => s.id === d.flagship.systemId)!;
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `Built a ${ship} at ${at.name} (combat strength ${combatStrength(d.flagship)}).`,
  });
  return d;
}

/** REARM (core §6: refill invasion personnel) — instant, shipyards only. */
function rearm(state: GameState): GameState {
  if (!canRearm(state).ok) return state;
  const d = structuredClone(state) as GameState;
  const cost = rearmCost(d.flagship);
  d.empire.credits -= cost;
  d.flagship.troops = maxTroops(d.flagship);
  const at = d.galaxy.systems.find((s) => s.id === d.flagship.systemId)!;
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `Troops board at ${at.name} (invasion strength ${d.flagship.troops}).`,
  });
  return d;
}

/**
 * ATTACK (core §4: major planetary actions advance time). The battle
 * resolves now (deterministic, sim RNG) and one year elapses — won or lost.
 */
function beginAttack(state: GameState, targetId: string, stance: Stance): GameState {
  if (!canAttack(state, targetId).ok) return state;
  const d = structuredClone(state) as GameState;
  resolveBattle(d, targetId, stance);
  return runYears(d, 1);
}
