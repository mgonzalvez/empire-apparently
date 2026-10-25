/**
 * Deterministic galaxy generation (core spec §3).
 *
 * Same seed → deep-equal galaxy. Fairness invariants (core §3 "Starting
 * conditions" + core §10 "Balance and fairness"):
 *  - Homeworld is secure: yellow star, never a supernova candidate.
 *  - Rivals start at grid-Chebyshev distance ≥ 2 from the homeworld.
 *  - At least two viable early expansion targets: inhabited, neutral or
 *    independent, development ≤ 2, grid-adjacent to the homeworld.
 *  - No supernova candidates in the opening zone (grid-Chebyshev ≤ 1).
 *
 * Ownership model (core §3: "implemented as ownership and visibility
 * fields"): `ownerId` (null = independent/neutral) + `explored`.
 */

import { Rng } from './random';
import type {
  Faction,
  Galaxy,
  Planet,
  PlanetType,
  Specialization,
  StarClass,
  System,
} from './types';
import { GALAXY, type SupernovaFrequency } from '../data/balance';
import {
  FACTION_COLORS,
  HOMENAMES,
  INDEPENDENT_NAMES,
  PLANET_NAMES,
  PLAYER_FACTION_NAME,
  RIVAL_NAMES,
  SYSTEM_NAMES,
} from '../data/names';

export interface GalaxyOptions {
  supernovaFrequency?: SupernovaFrequency;
}

/** Planet type → its natural initial specialization (core §5). */
export const TYPE_TO_SPECIALIZATION: Record<PlanetType, Specialization> = {
  foundry: 'industrial',
  quarry: 'mining',
  market: 'economic',
  bastion: 'fortress',
  garden: 'balanced',
};

const ALL_SPECIALIZATIONS: readonly Specialization[] = [
  'industrial',
  'mining',
  'economic',
  'fortress',
  'balanced',
];

const round2 = (v: number): number => Math.round(v * 100) / 100;

const chebyshev = (a: { gx: number; gy: number }, b: { gx: number; gy: number }): number =>
  Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Grid cells in fixed compass order around a cell. */
const GRID_NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export function defenseForPlanet(type: PlanetType, starClass: StarClass, development: number): number {
  return (
    GALAXY.defenseBase +
    GALAXY.defensePerDevelopment * development +
    (type === 'bastion' ? GALAXY.bastionDefenseBonus : 0) +
    (starClass === 'binary' ? GALAXY.binaryStarDefenseBonus : 0)
  );
}

interface Cell {
  gx: number;
  gy: number;
  x: number;
  y: number;
}

export function generateGalaxy(seed: number, opts: GalaxyOptions = {}): Galaxy {
  const frequency = opts.supernovaFrequency ?? GALAXY.supernova.defaultFrequency;
  const rng = new Rng(seed);
  const { gridCols, gridRows, cellJitter, minSystemDistance, layoutPasses } = GALAXY;

  // ── 1. Grid cells (row-major; system index == cell index) ────────────────
  const cells: Cell[] = [];
  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      cells.push({ gx, gy, x: 0, y: 0 });
    }
  }

  // ── 2. Homeworld cell: one of the four central cells ─────────────────────
  const centerCells = [
    1 * gridCols + 2,
    1 * gridCols + 3,
    2 * gridCols + 2,
    2 * gridCols + 3,
  ];
  const hwCell = rng.pick(centerCells);
  const homeworldId = `S${String(hwCell).padStart(2, '0')}`;

  // ── 3. Coordinates: jittered cell centers, min-distance repair ───────────
  const jitter = (c: Cell): [number, number] => [
    round2(10 + c.gx * 20 + (rng.next() - 0.5) * 2 * cellJitter),
    round2(10 + c.gy * 20 + (rng.next() - 0.5) * 2 * cellJitter),
  ];
  for (const c of cells) [c.x, c.y] = jitter(c);
  for (let pass = 0; pass < layoutPasses; pass++) {
    let clean = true;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (distance(cells[i], cells[j]) < minSystemDistance) {
          clean = false;
          [cells[j].x, cells[j].y] = jitter(cells[j]);
        }
      }
    }
    if (clean) break;
  }

  // ── 4. Ownership: player, rival capitals + colonies, independents ────────
  const owner = new Array<string | null>(cells.length).fill(null);
  owner[hwCell] = 'player';

  const rivalCapitals: number[] = [];
  const takeCapitals = (minRivalSpacing: number): void => {
    for (const i of rng.shuffled(cells.map((_, i) => i))) {
      if (rivalCapitals.length >= GALAXY.rivalCount) break;
      if (chebyshev(cells[i], cells[hwCell]) < GALAXY.rivalMinGridDistanceFromPlayer) continue;
      if (rivalCapitals.some((r) => chebyshev(cells[i], cells[r]) < minRivalSpacing)) continue;
      rivalCapitals.push(i);
    }
  };
  takeCapitals(2);
  if (rivalCapitals.length < GALAXY.rivalCount) takeCapitals(1); // unreachable fallback

  // Mark capitals first so the colony search can never pick a capital cell.
  rivalCapitals.forEach((cap, k) => {
    owner[cap] = `rival-${k}`;
  });

  // Rival second system: nearest unassigned cell to the capital,
  // never grid-adjacent to the homeworld.
  rivalCapitals.forEach((cap, k) => {
    const options = cells
      .map((_, i) => i)
      .filter((i) => owner[i] === null && chebyshev(cells[i], cells[hwCell]) >= 2)
      .sort((a, b) => distance(cells[a], cells[cap]) - distance(cells[b], cells[cap]));
    // Stable sort → ties resolve by index order (deterministic).
    owner[options[0]] = `rival-${k}`;
  });

  const remaining = cells.map((_, i) => i).filter((i) => owner[i] === null);
  const independentCells = rng.shuffled(remaining).slice(0, GALAXY.independentCount);
  independentCells.forEach((i, k) => {
    owner[i] = `ind-${k}`;
  });

  // ── 5. Uninhabited systems: N of the neutral cells ───────────────────────
  const neutralCells = remaining.filter((i) => owner[i] === null);
  const uninhabited = new Set(
    rng.shuffled(neutralCells).slice(0, GALAXY.uninhabitedOfNeutral),
  );

  // ── 6. Names (dealt from shuffled pools — no repeats in a galaxy) ────────
  const systemNames = rng.shuffled(SYSTEM_NAMES);
  const homeName = rng.pick(HOMENAMES);
  const planetNames = rng.shuffled(PLANET_NAMES);
  const rivalNames = rng.shuffled(RIVAL_NAMES);
  const independentNames = rng.shuffled(INDEPENDENT_NAMES);
  let systemNameIdx = 0;
  let planetNameIdx = 0;

  // ── 7. Build systems ─────────────────────────────────────────────────────
  const makePlanet = (
    type: PlanetType,
    development: number,
    name?: string,
  ): Planet => {
    const natural = TYPE_TO_SPECIALIZATION[type];
    const specialization = rng.chance(GALAXY.foreignSpecializationChance)
      ? rng.pick(ALL_SPECIALIZATIONS.filter((s) => s !== natural))
      : natural;
    const [lo, hi] = GALAXY.populationByType[type];
    return {
      name: name ?? planetNames[planetNameIdx++],
      type,
      specialization,
      development,
      population: rng.intRange(lo, hi + 1),
      stability: 100,
      garrison: 0,
    };
  };

  const systems: System[] = cells.map((c, i) => {
    const isHomeworld = i === hwCell;
    const starClass: StarClass = isHomeworld
      ? GALAXY.homeworld.starClass
      : rng.weighted(GALAXY.starClassWeights);

    let planet: Planet | null = null;
    if (!uninhabited.has(i)) {
      const type: PlanetType = isHomeworld
        ? GALAXY.homeworld.planetType
        : rng.weighted(GALAXY.planetTypeWeights);
      let development = weightedDev(rng);
      if (isHomeworld) development = GALAXY.homeworld.development;
      if (rivalCapitals.includes(i)) development = Math.max(development, 3);
      planet = makePlanet(type, development);
    }

    const defense = planet
      ? defenseForPlanet(planet.type, starClass, planet.development)
      : GALAXY.uninhabitedDefense;

    return {
      id: `S${String(i).padStart(2, '0')}`,
      name: isHomeworld ? homeName : systemNames[systemNameIdx++],
      x: c.x,
      y: c.y,
      gx: c.gx,
      gy: c.gy,
      starClass,
      planet,
      defense,
      ownerId: owner[i],
      previousOwnerId: null,
      explored: owner[i] === 'player' || chebyshev(c, cells[hwCell]) <= 1,
      occupation: 'none',
      destroyed: false,
      instability: 0,
      supernovaCandidate: false,
    };
  });

  // ── 8. Supernova candidates (never the homeworld, not the opening zone) ──
  const sup = GALAXY.supernova;
  const [cMin, cMax] = sup.candidatesByFrequency[frequency];
  const candidateCount = rng.intRange(cMin, cMax + 1);
  const candidatePool = cells
    .map((_, i) => i)
    .filter(
      (i) =>
        i !== hwCell &&
        chebyshev(cells[i], cells[hwCell]) >= sup.minGridDistanceFromPlayer,
    );
  const candidates = new Set(rng.shuffled(candidatePool).slice(0, candidateCount));
  for (const i of systems.map((_, i) => i)) {
    systems[i].instability = candidates.has(i)
      ? rng.intRange(sup.candidateStartInstability[0], sup.candidateStartInstability[1] + 1)
      : rng.intRange(sup.nonCandidateInstability[0], sup.nonCandidateInstability[1] + 1);
    systems[i].supernovaCandidate = candidates.has(i);
  }

  // ── 9. Fairness repair: ≥ 2 viable early targets next to the homeworld ───
  ensureViableEarlyTargets(systems, cells, hwCell);

  // ── 10. Factions ─────────────────────────────────────────────────────────
  const factions: Faction[] = [
    { id: 'player', name: PLAYER_FACTION_NAME, kind: 'player', color: FACTION_COLORS.player },
    ...Array.from({ length: GALAXY.rivalCount }, (_, k) => ({
      id: `rival-${k}`,
      name: rivalNames[k],
      kind: 'rival' as const,
      color: FACTION_COLORS.rivals[k],
    })),
    ...Array.from({ length: GALAXY.independentCount }, (_, k) => ({
      id: `ind-${k}`,
      name: independentNames[k],
      kind: 'independent' as const,
      color: FACTION_COLORS.independents[k],
    })),
  ];

  const capitalIds: Record<string, string> = {
    player: homeworldId,
  };
  rivalCapitals.forEach((cap, k) => {
    capitalIds[`rival-${k}`] = `S${String(cap).padStart(2, '0')}`;
  });
  independentCells.forEach((i, k) => {
    capitalIds[`ind-${k}`] = `S${String(i).padStart(2, '0')}`;
  });

  return {
    seed,
    systems,
    factions,
    homeworldId,
    capitalIds,
  };
}

/** Weighted development draw (1..5). */
function weightedDev(rng: Rng): number {
  const total = GALAXY.developmentWeights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let d = 0; d < GALAXY.developmentWeights.length; d++) {
    roll -= GALAXY.developmentWeights[d];
    if (roll < 0) return d + 1;
  }
  return 5;
}

/**
 * Guarantee ≥ 2 viable early expansion targets adjacent to the homeworld:
 * inhabited, neutral or independent, development ≤ 2. Deterministic repair:
 * 1) weaken qualifying adjacent worlds (downgrade development, recompute defense);
 * 2) convert an adjacent uninhabited neutral by swapping uninhabited-ness
 *    with the first distant inhabited neutral (counts preserved).
 */
function ensureViableEarlyTargets(
  systems: System[],
  cells: Cell[],
  hwCell: number,
): void {
  const hw = cells[hwCell];
  const neighborIndices = GRID_NEIGHBORS.flatMap(([dx, dy]) => {
    const gx = hw.gx + dx;
    const gy = hw.gy + dy;
    const idx = cells.findIndex((c) => c.gx === gx && c.gy === gy);
    return idx >= 0 ? [idx] : [];
  });

  const isTarget = (s: System): boolean =>
    s.planet !== null &&
    s.ownerId !== 'player' &&
    s.id !== systems[hwCell].id &&
    (s.ownerId === null || s.ownerId.startsWith('ind-')) &&
    (s.planet?.development ?? 0) <= 2;

  const countTargets = (): number =>
    neighborIndices.filter((i) => isTarget(systems[i])).length;

  // Pass 1: weaken qualifying adjacent worlds.
  if (countTargets() < 2) {
    for (const i of neighborIndices) {
      if (countTargets() >= 2) break;
      const s = systems[i];
      if (s.planet && s.ownerId !== 'player' && s.id !== systems[hwCell].id) {
        // Rival colonies can never be grid-adjacent by construction, so this
        // only ever touches neutral/independent worlds.
        if (s.planet.development > 2) {
          s.planet.development = 2;
          s.defense = defenseForPlanet(s.planet.type, s.starClass, s.planet.development);
        }
      }
    }
  }

  // Pass 2: convert adjacent uninhabited neutrals (swap with a distant one).
  if (countTargets() < 2) {
    for (const i of neighborIndices) {
      if (countTargets() >= 2) break;
      const s = systems[i];
      if (s.planet === null && s.ownerId === null) {
        const distantIdx = systems.findIndex(
          (o) =>
            o.id !== s.id &&
            o.planet !== null &&
            o.ownerId === null &&
            chebyshev(o, systems[hwCell]) >= 2,
        );
        if (distantIdx >= 0) {
          const distant = systems[distantIdx];
          if (distant.planet === null) break; // findIndex guards this; keep TS happy
          const donorName = distant.planet.name;
          s.planet = {
            name: `Quiet ${donorName.split(' ').pop()}`,
            type: 'garden',
            specialization: 'balanced',
            development: 2,
            population: 12,
            stability: 100,
            garrison: 0,
          };
          s.defense = defenseForPlanet('garden', s.starClass, 2);
          distant.planet = null;
          distant.defense = GALAXY.uninhabitedDefense;
        }
      }
    }
  }
}

/**
 * Fixed 8-system test galaxy (milestones M1+, campaign simulator).
 * No RNG — deterministic by construction; everything explored.
 * Layout (4×2 grid):
 *   S00 ind (dev 2)  S01 neutral (dev 1)  S02 neutral (dev 3)  S03 rival capital
 *   S04 HOMENOWORLD  S05 ind (dev 1)      S06 rival colony     S07 uninhabited ★
 * S07 is a seeded supernova candidate over an empty system — nothing of
 * value is ever lost to it (used by C15/C16 tests).
 */
export function createFixtureGalaxy(): Galaxy {
  const sys = (
    i: number,
    name: string,
    starClass: StarClass,
    planet: Planet | null,
    ownerId: string | null,
    gx: number,
    gy: number,
    extra: Partial<System> = {},
  ): System => ({
    id: `S${String(i).padStart(2, '0')}`,
    name,
    x: 10 + gx * 20,
    y: 10 + gy * 20,
    gx,
    gy,
    starClass,
    planet,
    defense:
      planet === null
        ? GALAXY.uninhabitedDefense
        : defenseForPlanet(planet.type, starClass, planet.development),
    ownerId,
    previousOwnerId: null,
    explored: true,
    occupation: 'none',
    destroyed: false,
    instability: 0,
    supernovaCandidate: false,
    ...extra,
  });

  const p = (
    name: string,
    type: PlanetType,
    specialization: Specialization,
    development: number,
    population: number,
  ): Planet => ({ name, type, specialization, development, population, stability: 100, garrison: 0 });

  return {
    seed: 987654321,
    homeworldId: 'S04',
    systems: [
      sys(0, 'Quiet Harbor', 'yellow', p('Oatfield', 'garden', 'balanced', 2, 18), 'ind-0', 0, 0),
      sys(1, 'Cold Ledger', 'red', p('Cinder Flat', 'quarry', 'mining', 1, 6), null, 1, 0),
      sys(2, 'The Annex', 'blue', p('Milltown', 'market', 'economic', 3, 25), null, 2, 0),
      sys(3, 'Bureau of Arrival', 'binary', p('Brickhill', 'foundry', 'industrial', 3, 14), 'rival-0', 3, 0),
      sys(4, 'Kettle Green', 'yellow', p('Hearthmoor', 'garden', 'balanced', 3, 20), 'player', 0, 1),
      sys(5, 'The Free Post', 'yellow', p('Wheatline', 'garden', 'balanced', 1, 15), 'ind-1', 1, 1),
      sys(6, 'Milestone', 'red', p('Ashpool', 'quarry', 'mining', 2, 8), 'rival-0', 2, 1),
      sys(
        7,
        'The Last Form',
        'white',
        null,
        null,
        3,
        1,
        { supernovaCandidate: true, instability: 55 },
      ),
    ],
    factions: [
      { id: 'player', name: PLAYER_FACTION_NAME, kind: 'player', color: FACTION_COLORS.player },
      { id: 'rival-0', name: RIVAL_NAMES[2], kind: 'rival', color: FACTION_COLORS.rivals[0] },
      { id: 'ind-0', name: INDEPENDENT_NAMES[0], kind: 'independent', color: FACTION_COLORS.independents[0] },
      { id: 'ind-1', name: INDEPENDENT_NAMES[11], kind: 'independent', color: FACTION_COLORS.independents[1] },
    ],
    capitalIds: {
      player: 'S04',
      'rival-0': 'S03',
      'ind-0': 'S00',
      'ind-1': 'S05',
    },
  };
}
