/**
 * Balance configuration — the single home for ALL tunable numbers
 * (core spec §5, PLAN §8). Versioned; the campaign simulator (C12/C34)
 * tunes these values against the guardrails in PLAN §15.
 */

export const BALANCE_VERSION = 1;

export type SupernovaFrequency = 'zero' | 'low' | 'normal';

export const GALAXY = {
  systemCount: 20,
  gridCols: 5,
  gridRows: 4,
  mapWidth: 100,
  mapHeight: 80,
  /** ± map units of jitter around each cell center. */
  cellJitter: 7,
  /** Minimum Euclidean distance between any two systems. */
  minSystemDistance: 12,
  /** Resample passes for the minimum-distance repair (then accept). */
  layoutPasses: 16,

  rivalCount: 3,
  rivalSystemsPerFaction: 2,
  /** Independent factions (one system each); the rest are neutral. */
  independentCount: 7,
  /** How many neutral systems are uninhabited (waypoints / supernova sites). */
  uninhabitedOfNeutral: 3,

  /** Rival cells must be this grid-Chebyshev distance from the homeworld. */
  rivalMinGridDistanceFromPlayer: 2,

  starClassWeights: [
    ['yellow', 35],
    ['red', 25],
    ['blue', 15],
    ['binary', 15],
    ['white', 10],
  ] as const,

  planetTypeWeights: [
    ['foundry', 30],
    ['market', 30],
    ['quarry', 25],
    ['garden', 20],
    ['bastion', 15],
  ] as const,

  /** Development 1..5 distribution at generation. */
  developmentWeights: [20, 30, 30, 15, 5],

  /** Chance a planet starts with a non-natural specialization. */
  foreignSpecializationChance: 0.3,

  /** [min, max] population (millions) by planet type. */
  populationByType: {
    foundry: [8, 20],
    quarry: [3, 10],
    market: [15, 40],
    bastion: [2, 8],
    garden: [12, 30],
  } as const,

  homeworld: {
    starClass: 'yellow' as const,
    planetType: 'garden' as const,
    development: 3,
  },

  /** Initial defense = base + perDev*development (+ bonuses). */
  defenseBase: 2,
  /** Tuned C12: 1 — auto-developed late-game worlds (dev 5) stay at 7 base
   *  defense; at 2 they hit 12 and out-scale a 6-ship fleet. */
  defensePerDevelopment: 1,
  bastionDefenseBonus: 4,
  binaryStarDefenseBonus: 2,
  uninhabitedDefense: 1,

  supernova: {
    /** Candidate counts by frequency setting (core §10). */
    candidatesByFrequency: {
      zero: [0, 0],
      low: [2, 3],
      normal: [3, 5],
    } as const,
    /** "The default campaign uses low frequency." (core §10) */
    defaultFrequency: 'low' as SupernovaFrequency,
    /** Starting instability for candidates (non-candidates: 0..35). */
    candidateStartInstability: [45, 65] as const,
    nonCandidateInstability: [0, 35] as const,
    /**
     * Per-year instability increment for candidates (C15). Capped at 5 so
     * the critical warning always precedes detonation by ≥ 5 years (the
     * shown window's max is 6 — no false precision, core §10).
     */
    candidateRate: [3, 5] as const,
    /** Evacuation (C16; core §10): time-costed, partial preservation, no minigame. */
    evacuation: {
      ticks: 2,
      credits: 25,
      populationSavedFraction: 0.6,
    } as const,
    /** No candidates in the opening zone (fairness, core §3/§10). */
    minGridDistanceFromPlayer: 2,
    /** Stability thresholds (core §10 states, our numbers). */
    thresholdAnomalous: 50,
    thresholdCritical: 75,
    thresholdDetonation: 100,
  },
};

/** Campaign-scale rules (PLAN §4, §8). */
export const CAMPAIGN = {
  /** Core §3 "Starting conditions": enough to make meaningful decisions. */
  startingResources: { credits: 100, materials: 100, fuel: 100 },
  /** "A modest flagship fleet" (core §3): enough to strike and invade once. */
  startingFleetShips: { interceptor: 2, cruiser: 0, transport: 1 },
  /** Accepted defaults (PLAN §4). C12: 120 → 150 — the 100-seed sweep found
   *  every loss was a deadline (zero wipeouts): the 20-system campaign
   *  converges, it just needs the full ~50–75 minute session the p50 band
   *  (90–150 ticks at 20–30 s/action) already assumes. */
  deadlineYears: 150,
  victoryIntegration: 0.6,
  /** Event log cap (oldest entries trimmed first). */
  maxLogEntries: 400,
} as const;

/**
 * Empire score (C18; core §12 "final empire score"). Transparent weights on
 * the stats shown on the end screen — no hidden terms. ⚠ v1 assumption —
 * tuned in C34.
 */
export const EMPIRE_SCORE = {
  perConquest: 25,
  perAlignedWorld: 15,
  perSurvivedSupernova: 20,
  perFleetLost: -10,
  perYearServed: -1,
} as const;

/** Travel (C4; core §6: fuel by fleet size and distance, clear range rule). */
export const MOVE = {
  /**
   * Distance bands (map units; inclusive maxDistance). First matching band
   * wins. Beyond the last band's maxDistance → out of range (stage it).
   */
  bands: [
    { name: 'close', maxDistance: 30, years: 1, fuelPerShip: 1 },
    { name: 'medium', maxDistance: 60, years: 2, fuelPerShip: 3 },
    { name: 'far', maxDistance: 80, years: 3, fuelPerShip: 6 },
  ],
} as const;

export type MoveBand = (typeof MOVE.bands)[number];

/** The clear maximum jump range (core §6: no hidden teleportation). */
export const MAX_JUMP_RANGE: number =
  MOVE.bands[MOVE.bands.length - 1].maxDistance;

/**
 * Economy (C5; core §5, PLAN §8 table).
 * Production per galactic year = productionBySpec[spec] × development (1..5).
 * Initial table — tuned in C12/C34.
 * The table's "special" column is implemented with its feature:
 * Industrial shipyard discount (C6), Fortress defense/fleet support (C8/C10).
 */
export const ECON = {
  productionBySpec: {
    industrial: { credits: 1, materials: 3, fuel: 1 },
    mining: { credits: 1, materials: 2, fuel: 2 },
    economic: { credits: 3, materials: 1, fuel: 1 },
    fortress: { credits: 1, materials: 1, fuel: 1 },
    balanced: { credits: 2, materials: 2, fuel: 2 },
  },
} as const;

/** Fleet construction & condition (C6; core §6, PLAN §8). Initial values — tuned in C12/C34. */
export const FLEET = {
  /** Build costs (credits, materials). Construction is instant (0 ticks). */
  cost: {
    interceptor: { credits: 20, materials: 10 },
    cruiser: { credits: 60, materials: 40 },
    transport: { credits: 40, materials: 30 },
  },
  /** Orbital combat weight per ship class (C7 combat uses the same values). */
  combatWeight: { interceptor: 2, cruiser: 6, transport: 1 },
  /** Troops carried per transport (invasion capacity). */
  troopsPerTransport: 10,
  /** Full hull restoration — exactly 1 year, time-advancing. */
  repairCost: { credits: 30, materials: 0 },
  /** Rearm cost per missing troop (instant, shipyards only). */
  rearmCostPerTroop: 2,
  /** A shipyard is a PLAYER world with Fortress spec or development ≥ this. */
  shipyardMinDev: 3,
} as const;

/** Combat (C7; core §1 "fast automatic combat", PLAN §8). Initial values — tuned in C12/C34. */
export const COMBAT = {
  /** Documented stance multipliers (PLAN §8). */
  stances: {
    aggressive: { attack: 1.25, taken: 0.85, withdrawChance: 0 },
    balanced: { attack: 1.0, taken: 1.0, withdrawChance: 0 },
    cautious: { attack: 0.85, taken: 1.2, withdrawChance: 0.25 },
  },
  /** Seeded variance applied to each side's effective strength. */
  variance: [0.9, 1.1] as const,
  /** Ground defense: bastion fortifications + development modifier. */
  bastionGroundBonus: 4,
  developmentPerLevel: 1,
  /** Hull degrades by this × the ship-loss fraction (0.5 = half). */
  hullDamageFactor: 0.5,
  /** When the orbit is won, this fraction of the world's static defenses
   *  survives the change of regime (C12: conquered worlds are not free
   *  targets — their defenses, and their garrison, stand next to each other). */
  defensesSurviveFraction: 0.25,
} as const;

/** Occupation (C8, extended C10; core §9, PLAN §8). Initial values — tuned in C12/C34. */
export const OCC = {
  /** Recommended garrison = development × this … */
  garrisonPerDevelopment: 1,
  /** … + this when a rival faction is grid-adjacent (C10 threat nuance). */
  rivalThreatBonus: 1,
  /** Stability moves per year while occupied. */
  stabilityRisePerYear: 10,
  stabilityFallPerYear: 20,
  /** Integration gains = stability/100 × this, per year (rate ∝ stability). */
  integrationRatePerYear: 50,
  /** Tier-0 fallback (C10): below this stability, a docked flagship with
   *  spare troops automatically tops the garrison up to recommended. */
  autoTopUpBelowStability: 40,
} as const;

/** Rival factions v1 (C8; C11 adds the formal action budget). */
export const RIVAL = {
  /** Expand into a neighbor when own defense ≥ ratio × target defense. */
  expandRatio: 1.5,
  /** Attack a player world when fleet ≥ ratio × its effective defense
   *  (orbital defense + garrison). At this ratio an attack always lands —
   *  the threat is telegraphed, never a coin flip (core §11: no hidden cheating).
   *  Tuned C12: 2.5 paces the flotilla — it wins, loses ~30% of itself, and
   *  must rebuild before it knocks again. */
  attackRatio: 2.5,
  /** Otherwise reinforce the weakest owned system by this much per year. */
  reinforcePerYear: 1,
  /** Reinforce target = base + perDev × development. */
  defenseTargetBase: 4,
  defenseTargetPerDev: 2,
  /** Fixed starting bonus (core §11): every rival starts with this fleet.
   *  Tuned C12: 2 — the first flotilla threat is a few years off. */
  startingFleet: 2,
  /** The BUILD action: the rival fleet grows by this much per year. */
  fleetBuildPerYear: 1,
  /** Tuned C12: flotillas stop growing here — no endless 30-ship monsters,
   *  and the 2.5× gate keeps them away from garrisoned worlds. */
  fleetCap: 12,
} as const;

/**
 * Support fleets (C13; core §7 "up to three" autonomous support fleets).
 * Initial values — tuned in C34.
 */
export const SUPPORT = {
  /** Hard cap (core §7). */
  maxFleets: 3,
  /** Commissioned composition — a modest escort of REAL ships (never free). */
  startingShips: { interceptor: 2, cruiser: 0, transport: 1 },
  /** Below this hull the fleet heads for home (Returning). */
  criticalHull: 25,
  /**
   * Patrol (C14): rival flotillas of this size or smaller, grid-adjacent to
   * the patrolled world, are intercepted (weakened) once per year.
   */
  weakFleetSize: 2,
  /** Ships destroyed per patrol intercept. */
  interceptLoss: 1,
  /** Hull damage a defending fleet takes when its world falls (C14). */
  defendHullDamage: 50,
} as const;

/** Automatic development (C9; core §9 "Planet development"): levels advance
 * on their own each year, capped, with a transparent cost paid from the
 * global pools. The development stage (core §4 step 2) runs AFTER income,
 * so a world can develop on that year's production. Initial values —
 * tuned in C12/C34.
 */
export const DEV = {
  /** Development cap (core §9: capped levels). */
  maxDevelopment: 5,
  /** Cost to advance from level N to N+1 (index = current level 1..4). */
  cost: {
    1: { credits: 20, materials: 10 }, // I → II
    2: { credits: 40, materials: 20 }, // II → III
    3: { credits: 60, materials: 30 }, // III → IV
    4: { credits: 80, materials: 40 }, // IV → V
  },
} as const;
