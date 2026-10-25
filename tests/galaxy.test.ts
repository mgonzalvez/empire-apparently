import { describe, expect, it } from 'vitest';
import { createFixtureGalaxy, defenseForPlanet, generateGalaxy } from '../src/engine/galaxy';
import type { Galaxy, System } from '../src/engine/types';
import { GALAXY } from '../src/data/balance';

const SEEDS = [1, 42, 999, 12345, 20261025];

const chebyshev = (a: System, b: System): number =>
  Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));

const distance = (a: System, b: System): number => Math.hypot(a.x - b.x, a.y - b.y);

function ownershipCounts(g: Galaxy): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of g.systems) {
    const key = s.ownerId ?? 'neutral';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe('galaxy generation — invariants', () => {
  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      const g = generateGalaxy(seed);

      it('has 20 uniquely-identified systems in canonical order', () => {
        expect(g.systems).toHaveLength(GALAXY.systemCount);
        g.systems.forEach((s, i) => {
          expect(s.id).toBe(`S${String(i).padStart(2, '0')}`);
        });
        const names = g.systems.map((s) => s.name);
        expect(new Set(names).size).toBe(names.length);
        const planetNames = g.systems
          .map((s) => s.planet?.name)
          .filter((n): n is string => n !== undefined);
        expect(new Set(planetNames).size).toBe(planetNames.length);
      });

      it('keeps coordinates inside the map with min spacing', () => {
        for (const s of g.systems) {
          expect(s.x).toBeGreaterThanOrEqual(1);
          expect(s.x).toBeLessThanOrEqual(GALAXY.mapWidth - 1);
          expect(s.y).toBeGreaterThanOrEqual(1);
          expect(s.y).toBeLessThanOrEqual(GALAXY.mapHeight - 1);
        }
        for (let i = 0; i < g.systems.length; i++) {
          for (let j = i + 1; j < g.systems.length; j++) {
            expect(
              distance(g.systems[i], g.systems[j]),
              `${g.systems[i].id}-${g.systems[j].id}`,
            ).toBeGreaterThanOrEqual(GALAXY.minSystemDistance - 1e-9);
          }
        }
      });

      it('owns the expected faction mix (1 player, 3×2 rivals, 7 ind, 6 neutral)', () => {
        const c = ownershipCounts(g);
        expect(c.player).toBe(1);
        expect(c['rival-0'] ?? 0).toBe(GALAXY.rivalSystemsPerFaction);
        expect(c['rival-1'] ?? 0).toBe(GALAXY.rivalSystemsPerFaction);
        expect(c['rival-2'] ?? 0).toBe(GALAXY.rivalSystemsPerFaction);
        expect(g.factions.filter((f) => f.kind === 'independent')).toHaveLength(
          GALAXY.independentCount,
        );
        expect(c.neutral ?? 0).toBe(
          GALAXY.systemCount -
            1 -
            GALAXY.rivalCount * GALAXY.rivalSystemsPerFaction -
            GALAXY.independentCount,
        );
      });

      it('has exactly 3 uninhabited systems, all neutral', () => {
        const uninhabited = g.systems.filter((s) => s.planet === null);
        expect(uninhabited).toHaveLength(GALAXY.uninhabitedOfNeutral);
        for (const s of uninhabited) {
          expect(s.ownerId).toBeNull();
          expect(s.defense).toBe(GALAXY.uninhabitedDefense);
        }
      });

      it('keeps the homeworld secure', () => {
        const hw = g.systems.find((s) => s.id === g.homeworldId)!;
        expect(hw.ownerId).toBe('player');
        expect(hw.starClass).toBe(GALAXY.homeworld.starClass);
        expect(hw.supernovaCandidate).toBe(false);
        expect(hw.planet).not.toBeNull();
        expect(hw.explored).toBe(true);
        expect(hw.destroyed).toBe(false);
        expect(g.capitalIds.player).toBe(g.homeworldId);
      });

      it('keeps rivals out of the opening zone', () => {
        const hw = g.systems.find((s) => s.id === g.homeworldId)!;
        for (const s of g.systems) {
          if (s.ownerId?.startsWith('rival-')) {
            expect(chebyshev(s, hw)).toBeGreaterThanOrEqual(
              GALAXY.rivalMinGridDistanceFromPlayer,
            );
          }
        }
      });

      it('guarantees ≥ 2 viable early expansion targets', () => {
        const hw = g.systems.find((s) => s.id === g.homeworldId)!;
        const targets = g.systems.filter(
          (s) =>
            s.id !== hw.id &&
            chebyshev(s, hw) <= 1 &&
            s.planet !== null &&
            (s.ownerId === null || s.ownerId.startsWith('ind-')) &&
            s.planet.development <= 2,
        );
        expect(targets.length).toBeGreaterThanOrEqual(2);
      });

      it('has no supernova candidates in the opening zone', () => {
        const hw = g.systems.find((s) => s.id === g.homeworldId)!;
        for (const s of g.systems) {
          if (s.supernovaCandidate) {
            expect(chebyshev(s, hw)).toBeGreaterThanOrEqual(
              GALAXY.supernova.minGridDistanceFromPlayer,
            );
          }
        }
      });

      it('explored = player-owned or grid-adjacent to the homeworld', () => {
        const hw = g.systems.find((s) => s.id === g.homeworldId)!;
        for (const s of g.systems) {
          const expected = s.ownerId === 'player' || chebyshev(s, hw) <= 1;
          expect(s.explored, s.id).toBe(expected);
        }
      });

      it('defense matches the documented formula', () => {
        for (const s of g.systems) {
          const expected =
            s.planet === null
              ? GALAXY.uninhabitedDefense
              : defenseForPlanet(s.planet.type, s.starClass, s.planet.development);
          expect(s.defense, s.id).toBe(expected);
        }
      });

      it('instability is within documented bands', () => {
        const sup = GALAXY.supernova;
        for (const s of g.systems) {
          if (s.supernovaCandidate) {
            expect(s.instability).toBeGreaterThanOrEqual(sup.candidateStartInstability[0]);
            expect(s.instability).toBeLessThanOrEqual(sup.candidateStartInstability[1]);
          } else {
            expect(s.instability).toBeGreaterThanOrEqual(sup.nonCandidateInstability[0]);
            expect(s.instability).toBeLessThanOrEqual(sup.nonCandidateInstability[1]);
          }
        }
      });
    });
  }
});

describe('galaxy generation — supernova frequency', () => {
  it('zero → no candidates', () => {
    for (const seed of SEEDS) {
      const g = generateGalaxy(seed, { supernovaFrequency: 'zero' });
      expect(g.systems.some((s) => s.supernovaCandidate)).toBe(false);
    }
  });

  it('low → 2–3 candidates; normal → 3–5', () => {
    for (const seed of SEEDS) {
      const low = generateGalaxy(seed, { supernovaFrequency: 'low' });
      const nLow = low.systems.filter((s) => s.supernovaCandidate).length;
      expect(nLow).toBeGreaterThanOrEqual(2);
      expect(nLow).toBeLessThanOrEqual(3);

      const normal = generateGalaxy(seed, { supernovaFrequency: 'normal' });
      const nNormal = normal.systems.filter((s) => s.supernovaCandidate).length;
      expect(nNormal).toBeGreaterThanOrEqual(3);
      expect(nNormal).toBeLessThanOrEqual(5);
    }
  });

  it('default frequency is low (core §10)', () => {
    const g = generateGalaxy(123);
    const n = g.systems.filter((s) => s.supernovaCandidate).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
  });
});

describe('galaxy generation — performance', () => {
  it('generates a 20-system galaxy in < 50 ms', () => {
    const N = 100;
    const start = Date.now();
    for (let i = 0; i < N; i++) generateGalaxy(1000 + i);
    const avgMs = (Date.now() - start) / N;
    expect(avgMs).toBeLessThan(50);
  });
});

describe('fixture galaxy', () => {
  it('is deterministic by construction', () => {
    expect(createFixtureGalaxy()).toEqual(createFixtureGalaxy());
  });

  it('has the documented shape', () => {
    const g = createFixtureGalaxy();
    expect(g.systems).toHaveLength(8);
    const byId = (id: string) => g.systems.find((s) => s.id === id)!;

    expect(byId('S04').ownerId).toBe('player');
    expect(g.homeworldId).toBe('S04');
    expect(byId('S04').starClass).toBe('yellow');
    expect(byId('S03').ownerId).toBe('rival-0');
    expect(g.capitalIds['rival-0']).toBe('S03');

    // S07: uninhabited supernova candidate — nothing of value is lost to it.
    const last = byId('S07');
    expect(last.planet).toBeNull();
    expect(last.supernovaCandidate).toBe(true);
    expect(last.instability).toBeGreaterThanOrEqual(
      GALAXY.supernova.thresholdAnomalous,
    );

    // Three viable early targets adjacent to the homeworld (S00, S01, S05).
    const hw = byId('S04');
    const targets = g.systems.filter(
      (s) =>
        s.id !== hw.id &&
        chebyshev(s, hw) <= 1 &&
        s.planet !== null &&
        (s.ownerId === null || s.ownerId.startsWith('ind-')) &&
        s.planet.development <= 2,
    );
    expect(targets.length).toBeGreaterThanOrEqual(2);
    expect(targets.map((s) => s.id).sort()).toEqual(['S00', 'S01', 'S05']);
  });
});
