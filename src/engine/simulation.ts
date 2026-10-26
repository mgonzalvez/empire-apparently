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
import { recommendedGarrison } from './occupation';
import { buildCost, canBuild, canRearm, canRepair, clampTroops, combatStrength, maxTroops, rearmCost, repairCost } from './fleets';
import { canAttack, resolveBattle } from './combat';
import { applyOccupation } from './occupation';
import { applyRivals } from './rivals';
import { applySupportFleets, assignMission, commission } from './support';
import { applySupernovas, evacuate } from './supernova';
import { evaluateWinLose } from './victory';
import { applyNarration } from './dialogue';
import { emit } from './events';
import { CAMPAIGN, FLEET, GALAXY } from '../data/balance';
import type { AdvisorId, GameState, ShipClass, Specialization, Stance, SupportMission } from './types';

// ── New game ─────────────────────────────────────────────────────────────

export interface NewGameOptions {
  supernovaFrequency?: 'zero' | 'low' | 'normal';
  /** C17: the advisor of record. Mechanically neutral (C19 makes it speak;
   *  until then it is stored, never consulted by the sim). */
  advisor?: AdvisorId;
  /** C18: sound preference recorded into the save (playback reads the
   *  audio module's persisted preference; off by default). */
  sound?: boolean;
}

const ADVISOR_IDS: readonly AdvisorId[] = ['mort', 'bingo', 'handbook'];

export function newGame(seed: number, opts: NewGameOptions = {}): GameState {
  const frequency = opts.supernovaFrequency ?? GALAXY.supernova.defaultFrequency;
  const advisor =
    opts.advisor !== undefined && ADVISOR_IDS.includes(opts.advisor)
      ? opts.advisor
      : 'mort';
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
    events: [],
    lastDialogue: null,
    tutorial: null,
    dialogue: {
      advisor,
      recentIds: [],
      shown: {},
      lastShown: {},
      lastNarratedSeq: 0,
      // seq 0 is reserved for "nothing narrated"; events start at 1.
      seq: 1,
    },
    settings: {
      hints: 'normal',
      supernovaFreq: frequency,
      advisor,
      sound: opts.sound ?? false,
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
  /** 4. Process fleet missions and arrivals. — C13 support fleets. */
  fleets: (d) => {
    resolveFleetMovement(d);
    applySupportFleets(d);
  },
  /** 5. Process rival faction decisions (C11: attack/expand/reinforce/build budget). */
  rivals: (d, rng) => applyRivals(d, rng),
  /** 6. Advance stellar instability and events. — C15/C16, C29. */
  stars: (d) => applySupernovas(d),
  /** 7. Evaluate victory and defeat. */
  winLose: (d) => evaluateWinLose(d),
};

export interface TickOptions {
  /** Test/inspection hook: override individual stages (others keep defaults). */
  stages?: Partial<Record<StageName, StageFn>>;
  /** Observation hook: called with each stage name, in execution order. */
  trace?: (stage: StageName) => void;
  /** Test hook: suppress the narration step (C19) — for sim/narration
   *  separation tests. Default: narrate. */
  narrate?: boolean;
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
  d.rng = rng.state(); // serialize the sim stream first — sim outcomes are final
  // Narration (C19): AFTER all clock stages, so the tick's full event batch
  // is visible. It draws ONLY from the narrRng stream (PLAN §7: independent
  // streams) — the sim RNG is never consumed by narration.
  if (opts.narrate ?? true) {
    const narr = new Rng(d.narrRng);
    applyNarration(d, narr);
    d.narrRng = narr.state();
  }
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
  | { type: 'SPECIALIZE'; systemId: string; specialization: Specialization } // instant, 0 ticks (C9)
  | { type: 'REINFORCE'; systemId: string } // instant, 0 ticks (C10)
  | { type: 'COMMISSION' } // instant, 0 ticks — support fleet at the shipyard (C13)
  | {
      type: 'ASSIGN_MISSION';
      fleetId: string;
      mission: SupportMission | null; // null = stand down (return home)
      targetId: string | null;
    } // instant, 0 ticks — the machine executes (C14)
  | { type: 'EVACUATE'; systemId: string } // instant, 0 ticks — then takes 2 years (C16)
  | { type: 'SET_ADVISOR'; advisor: AdvisorId }; // instant, 0 ticks, off-ledger — narration only (C19)

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
      return narrate(buildShip(state, action.ship));
    case 'REARM':
      return narrate(rearm(state));
    case 'SPECIALIZE':
      return narrate(specialize(state, action.systemId, action.specialization));
    case 'REINFORCE':
      return narrate(reinforce(state, action.systemId));
    case 'COMMISSION':
      return narrate(commission(state));
    case 'ASSIGN_MISSION':
      return narrate(assignMission(state, action.fleetId, action.mission, action.targetId));
    case 'EVACUATE':
      return narrate(evacuate(state, action.systemId));
    case 'SET_ADVISOR':
      return setAdvisor(state, action.advisor);
    default:
      // Unknown/unlisted actions never change anything (core §4).
      return state;
  }
}

/**
 * Narration for instant (0-tick) actions (C19). Time-advancing actions
 * narrate inside runTick (one narration per tick, covering that tick's
 * whole event batch); instant actions don't run a tick, so they narrate
 * here. `narrate` is a no-op for unchanged states — a refused action
 * emits no events and advances no narration.
 */
function narrate(next: GameState): GameState {
  const narr = new Rng(next.narrRng);
  applyNarration(next, narr);
  next.narrRng = narr.state();
  return next;
}

/**
 * SET_ADVISOR (C19, SPEC §3 "allow switching advisors from the main
 * interface"): narration-only. The sim never reads which advisor speaks —
 * the neutrality test pins an identical sim-state hash under different
 * advisors. Unknown ids fall back to M.O.R.T.
 */
function setAdvisor(state: GameState, advisor: AdvisorId): GameState {
  const a = ADVISOR_IDS.includes(advisor) ? advisor : 'mort';
  if (a === state.dialogue.advisor) return state;
  const d = structuredClone(state) as GameState;
  d.dialogue.advisor = a;
  d.settings.advisor = a;
  return d;
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
  emit(d, 'travel.depart', {
    planetName: dest.explored ? dest.name : 'the uncharted system',
    years: quote.years ?? 1,
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
  emit(d, 'fleet.repaired');
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
  emit(d, 'ship.built');
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
 * REINFORCE (C10, optional Tier-2): the flagship, docked at a player world,
 * moves troops into its garrison up to the recommended level. Instant, 0
 * ticks. Proactive twin of the auto top-up: same effect, chosen timing.
 * No-op unless docked, world is occupied, garrison short, and troops spare.
 */
function reinforce(state: GameState, systemId: string): GameState {
  const f = state.flagship;
  if (f.travel !== null || f.systemId !== systemId) return state;
  const s = state.galaxy.systems.find((x) => x.id === systemId);
  if (!s || s.ownerId !== 'player' || s.occupation !== 'occupied' || !s.planet) return state;
  const rec = recommendedGarrison(s.planet, s, state.galaxy);
  if (s.planet.garrison >= rec || f.troops <= 0) return state;
  const d = structuredClone(state) as GameState;
  const t = d.galaxy.systems.find((x) => x.id === systemId)!;
  const move = Math.min(rec - t.planet!.garrison, d.flagship.troops);
  t.planet!.garrison += move;
  d.flagship.troops -= move;
  d.log.push({
    tick: d.tick,
    kind: 'economy',
    text: `${move} troop${move === 1 ? '' : 's'} reinforced the garrison of ${t.planet!.name} (${t.planet!.garrison} standing).`,
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
