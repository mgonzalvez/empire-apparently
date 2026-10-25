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
import { CAMPAIGN, GALAXY } from '../data/balance';
import type { GameState } from './types';

// ── New game ─────────────────────────────────────────────────────────────

export interface NewGameOptions {
  supernovaFrequency?: 'zero' | 'low' | 'normal';
}

export function newGame(seed: number, opts: NewGameOptions = {}): GameState {
  const frequency = opts.supernovaFrequency ?? GALAXY.supernova.defaultFrequency;
  const galaxy = generateGalaxy(seed, { supernovaFrequency: frequency });
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
  /** 1. Produce planetary resources. — C5: specialization×development table. */
  resources: () => {},
  /** 2. Progress automatic development. — C9. */
  development: () => {},
  /** 3. Advance occupation stability. — C8/C10 (garrison, rebellion). */
  occupation: () => {},
  /** 4. Process fleet missions and arrivals. — C13/C14 support fleets. */
  fleets: (d) => resolveFleetMovement(d),
  /** 5. Process rival faction decisions. — C8/C11. */
  rivals: () => {},
  /** 6. Advance stellar instability and events. — C15/C16, C29. */
  stars: () => {},
  /**
   * 7. Evaluate victory and defeat. — C8 adds the full rules (deadline,
   *    integration, no-recovery). C3: total wipe only.
   */
  winLose: (d) => {
    if (d.status !== 'active') return;
    const holdsAnything = d.galaxy.systems.some((s) => s.ownerId === 'player');
    if (!holdsAnything) {
      d.status = 'defeat';
      d.defeatReason = 'total';
      d.log.push({
        tick: d.tick,
        kind: 'warning',
        text: 'The empire no longer holds a single system. The Republic thanks you for your service.',
      });
    }
  },
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
  | { type: 'TRAVEL'; destinationId: string };
// C6: | { type: 'BUILD'; ship: ShipClass } | { type: 'REPAIR' }

export const TIME_ADVANCING_ACTIONS: ReadonlySet<SimAction['type']> = new Set([
  'WAIT',
  'TRAVEL',
]);

/** Pure dispatch: action → next state. Terminal campaigns are frozen. */
export function dispatchSim(state: GameState, action: SimAction): GameState {
  if (!TIME_ADVANCING_ACTIONS.has(action.type)) return state;
  if (state.status !== 'active') return state;
  switch (action.type) {
    case 'WAIT':
      return runYears(state, Math.max(1, Math.min(action.years ?? 1, 999)));
    case 'TRAVEL':
      return beginTravel(state, action.destinationId);
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

/** Total ships in a fleet (UI + C6 strength derivation). */
export function totalShips(fleet: { ships: { interceptor: number; cruiser: number; transport: number } }): number {
  return fleet.ships.interceptor + fleet.ships.cruiser + fleet.ships.transport;
}
