/**
 * C21 — Tutorial scenario: "Instructional Misfortune" (headless; the ten
 * lessons arrive in C22, enablement in C23).
 *
 * A deterministic 7-system region — the same on every load, by construction
 * (no RNG: every value is a literal):
 *
 *   S00 The Ledger     homeworld — player, integrated
 *   S01 Quiet Fields   easy independent (defense 2)
 *   S02 The Annex      weak rival colony (fleet 2 — frozen, never acts)
 *   S03 The Hourglass  scripted anomaly star (uninhabited): anomalous tick 14,
 *                      critical tick 17, armed tick 20, detonates tick 21 —
 *                      over an empty system: nothing of value is lost
 *   S04 Small Debt     easy independent (defense 2)
 *   S05 The Reckoning  finale target — the strongest defense in the region
 *   S06 The Blank      empty system (uninhabited, quiet star)
 *
 * Every system is within one jump of the homeworld (map distance ≤ 51 units
 * < MAX_JUMP_RANGE 80), so no step ever requires staged travel.
 *
 * Save-safe: every scenario mechanic is a plain GameState field — the region
 * itself, `rivalsFrozen`, `scriptedSupernova`, the granted support fleet.
 * No engine-side globals, nothing outside the save.
 *
 * Random narrative events: the engine has none yet (C29); when they arrive
 * they must respect an active tutorial (zero interference, per this chunk's
 * acceptance). Rival actions are frozen by `rivalsFrozen` (tested).
 *
 * The temporary support fleet ("The Borrowed Wing") is a standard fleet
 * (SUPPORT.startingShips) granted as a loan — the in-game line below explains
 * how normal play earns one. C23 converts or explains the loan at the
 * transition into a real campaign.
 */

import type { Faction, Fleet, GameState, Planet, ShipClass, System } from '../../engine/types';
import type { RngState } from '../../engine/random';
import { FLEET, SUPPORT } from '../balance';
import { FACTION_COLORS, PLAYER_FACTION_NAME } from '../names';

/** The scenario id recorded in `GameState.tutorial.scenario`. */
export const TUTORIAL_SCENARIO = 'instructional-misfortune';

/** Canonical ids of the seven systems (C22's steps reference these). */
export const TUTORIAL_SYSTEMS = {
  homeworld: 'S00',
  easyA: 'S01',
  rival: 'S02',
  anomaly: 'S03',
  easyB: 'S04',
  finale: 'S05',
  empty: 'S06',
} as const;

/** Scripted supernova phases (exact ticks; detonation follows the armed tick). */
export const TUTORIAL_SUPERNOVA_TICKS = {
  anomalousAt: 14,
  criticalAt: 17,
  armedAt: 20,
  /** The existing pipeline detonates on the tick AFTER the star arms. */
  detonatesAt: 21,
} as const;

const star = (
  id: string,
  name: string,
  x: number,
  y: number,
  gx: number,
  gy: number,
  starClass: System['starClass'],
): System => ({
  id,
  name,
  x,
  y,
  gx,
  gy,
  starClass,
  planet: null,
  defense: 0,
  ownerId: null,
  previousOwnerId: null,
  explored: true, // the tutorial map is fully visible from the start
  occupation: 'none',
  destroyed: false,
  instability: 0,
  supernovaCandidate: false,
  instabilityRate: 0,
  evacuationTicks: 0,
});

const world = (
  base: ReturnType<typeof star>,
  planet: Planet,
  defense: number,
  ownerId: string | null,
  occupation: System['occupation'],
): System => ({ ...base, planet, defense, ownerId, occupation });

export function createTutorialGame(): GameState {
  // ── The region ──────────────────────────────────────────────────────────
  const ledger = world(
    star('S00', 'The Ledger', 10, 20, 0, 0, 'yellow'),
    { name: 'The Ledger', type: 'garden', specialization: 'balanced', development: 3, population: 8, stability: 100, integration: 100, garrison: 0 },
    6,
    'player',
    'integrated',
  );
  const quietFields = world(
    star('S01', 'Quiet Fields', 28, 20, 1, 0, 'yellow'),
    { name: 'Quiet Fields', type: 'market', specialization: 'balanced', development: 2, population: 4, stability: 100, integration: 0, garrison: 0 },
    2,
    null,
    'none',
  );
  const annex = world(
    star('S02', 'The Annex', 46, 20, 2, 0, 'red'),
    { name: 'The Annex', type: 'quarry', specialization: 'balanced', development: 2, population: 3, stability: 100, integration: 0, garrison: 0 },
    3,
    'rival-0',
    'none',
  );
  const hourglass = star('S03', 'The Hourglass', 28, 38, 1, 1, 'red');
  hourglass.supernovaCandidate = true; // the scripted pipeline treats it as a candidate
  hourglass.instabilityRate = 10; // window math only — the pinning sets the value
  hourglass.instability = 30; // pre-script baseline (the first pinning tick overwrites it)
  const smallDebt = world(
    star('S04', 'Small Debt', 10, 56, 0, 2, 'yellow'),
    { name: 'Small Debt', type: 'foundry', specialization: 'balanced', development: 2, population: 5, stability: 100, integration: 0, garrison: 0 },
    2,
    null,
    'none',
  );
  const reckoning = world(
    star('S05', 'The Reckoning', 46, 38, 2, 1, 'blue'),
    { name: 'The Reckoning', type: 'bastion', specialization: 'balanced', development: 4, population: 6, stability: 100, integration: 0, garrison: 0 },
    8,
    null,
    'none',
  );
  const blank = star('S06', 'The Blank', 10, 38, 0, 1, 'white');

  const factions: Faction[] = [
    { id: 'player', name: PLAYER_FACTION_NAME, kind: 'player', color: FACTION_COLORS.player, fleet: 0 },
    { id: 'rival-0', name: 'The Patient Union', kind: 'rival', color: FACTION_COLORS.rivals[0], fleet: 2 },
  ];

  // ── The borrowed fleet (temporary; C23 settles the loan) ────────────────
  const wing: Fleet = {
    id: 'sf-1',
    name: 'The Borrowed Wing',
    systemId: TUTORIAL_SYSTEMS.homeworld,
    ships: { ...SUPPORT.startingShips },
    hull: 100,
    troops: 0,
    orders: { type: 'hold', targetId: null },
    travel: null,
    homeId: TUTORIAL_SYSTEMS.homeworld,
    supportState: 'patrolling', // unassigned → patrols home (Tier-0 fallback)
    mission: null,
  };

  // Fixed streams: the scenario draws only what the player's own actions
  // draw (combat variance, development) — fully deterministic per play.
  const rng: RngState = [1, 2, 3, 4];
  const narrRng: RngState = [4, 3, 2, 1];

  // The normal-service commission cost, from the same tables the shipyard
  // uses (SUPPORT.startingShips × FLEET.cost) — the in-game line stays factual.
  const wingShips = Object.values(wing.ships).reduce((a, b) => a + b, 0);
  const commissionCost = Object.entries(SUPPORT.startingShips).reduce(
    (sum, [k, n]) => ({
      credits: sum.credits + n * FLEET.cost[k as ShipClass].credits,
      materials: sum.materials + n * FLEET.cost[k as ShipClass].materials,
    }),
    { credits: 0, materials: 0 },
  );

  return {
    v: 1,
    seed: 0, // no seed — the region is literal, not generated
    tick: 0,
    rng,
    narrRng,
    galaxy: {
      seed: 0,
      systems: [ledger, quietFields, annex, hourglass, smallDebt, reckoning, blank],
      factions,
      homeworldId: TUTORIAL_SYSTEMS.homeworld,
      capitalIds: { player: TUTORIAL_SYSTEMS.homeworld, 'rival-0': TUTORIAL_SYSTEMS.rival },
    },
    empire: { credits: 150, materials: 150, fuel: 150 },
    flagship: {
      id: 'flagship',
      name: 'The Modest Escort',
      systemId: TUTORIAL_SYSTEMS.homeworld,
      ships: { interceptor: 3, cruiser: 0, transport: 2 },
      hull: 100,
      troops: 2 * FLEET.troopsPerTransport,
      orders: { type: 'hold', targetId: null },
      travel: null,
    },
    supports: [wing],
    rivals: [],
    narrative: { resolvedIds: [], cooldowns: {} },
    events: [],
    lastDialogue: null,
    tutorial: null, // C23 sets this on start (startTutorial)
    dialogue: { advisor: 'mort', recentIds: [], shown: {}, lastShown: {}, lastNarratedSeq: 0, seq: 1 },
    settings: {
      hints: 'normal',
      supernovaFreq: 'zero', // no random candidates — one scripted star, on a schedule
      advisor: 'mort',
      sound: false,
      theme: 'system',
    },
    stats: { battles: 0, wins: 0, losses: 0, fleetsLost: 0, supernovas: 0, conquests: 0 },
    status: 'active',
    defeatReason: null,
    lastBattle: null,
    rivalsFrozen: true, // C21: the rivals hold their breath for the whole scenario
    scriptedSupernova: {
      systemId: TUTORIAL_SYSTEMS.anomaly,
      ...TUTORIAL_SUPERNOVA_TICKS,
    },
    log: [
      {
        tick: 0,
        kind: 'info',
        text: 'Mandate accepted. You appear to be in charge. This one is a practice run.',
      },
      {
        tick: 0,
        kind: 'economy',
        text: `${wing.name} (${wingShips} ships) is docked at The Ledger. In normal service, support fleets are commissioned at the shipyard for ${commissionCost.credits} credits and ${commissionCost.materials} materials — this one is a loan, and the paperwork says "return optional".`,
      },
    ],
  };
}
