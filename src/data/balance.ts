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
  defensePerDevelopment: 2,
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
  /** Accepted defaults (PLAN §4): 120-year mandate, 60% integration victory. */
  deadlineYears: 120,
  victoryIntegration: 0.6,
  /** Event log cap (oldest entries trimmed first). */
  maxLogEntries: 400,
} as const;
