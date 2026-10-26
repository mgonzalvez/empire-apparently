import { describe, expect, it } from 'vitest';
import { SUPPORT } from '../src/data/balance';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { dispatchSim, newGame, runYears } from '../src/engine/simulation';
import { SUPPORT_COST } from '../src/engine/support';
import type { GameState } from '../src/engine/types';

/**
 * C13 acceptance: support fleets are real (never free), respect the
 * flagship's range/fuel rules, never invade without explicit orders,
 * return to safety when critical, and patrol home unassigned (Tier-0).
 *
 * Fixture facts: S04 "Kettle Green" is the player homeworld (dev 3 — a
 * shipyard). S05 is adjacent (20u, close band: 1yr, 1 fuel/ship).
 */

function fixtureState(): GameState {
  const s = newGame(4242);
  s.galaxy = createFixtureGalaxy();
  s.flagship.systemId = s.galaxy.homeworldId; // docked at the shipyard
  s.flagship.travel = null;
  return s;
}

const fleet = (s: GameState) => s.supports[0];

describe('support fleets: commissioning (C13)', () => {
  it('costs real ships: credits AND materials, ships created, cost logged', () => {
    const s = fixtureState();
    const c0 = s.empire.credits;
    const m0 = s.empire.materials;
    const next = dispatchSim(s, { type: 'COMMISSION' });
    expect(next.supports).toHaveLength(1);
    const f = fleet(next);
    expect(f.ships).toEqual({ interceptor: 2, cruiser: 0, transport: 1 });
    expect(f.hull).toBe(100);
    expect(f.homeId).toBe('S04');
    expect(f.systemId).toBe('S04');
    expect(next.empire.credits).toBe(c0 - SUPPORT_COST.credits);
    expect(next.empire.materials).toBe(m0 - SUPPORT_COST.materials);
    expect(SUPPORT_COST.credits).toBeGreaterThanOrEqual(1); // never free
    expect(SUPPORT_COST.materials).toBeGreaterThanOrEqual(1); // never free
    expect(next.log.some((l) => l.text.includes('commissioned'))).toBe(true);
  });

  it('requires a shipyard: away from one, the action is a no-op', () => {
    const s = fixtureState();
    s.flagship.systemId = 'S01'; // neutral, development 1 — no shipyard
    s.flagship.travel = null;
    const next = dispatchSim(s, { type: 'COMMISSION' });
    expect(next.supports).toHaveLength(0);
    expect(next.empire.credits).toBe(s.empire.credits);
    expect(next.empire.materials).toBe(s.empire.materials);
  });

  it('cannot be created for free: unaffordable → no-op, no negatives', () => {
    const s = fixtureState();
    s.empire.credits = 0;
    s.empire.materials = 0;
    const next = dispatchSim(s, { type: 'COMMISSION' });
    expect(next.supports).toHaveLength(0);
    expect(next.empire.credits).toBe(0);
    expect(next.empire.materials).toBe(0);
  });

  it('max 3 fleets: the fourth commission is a no-op', () => {
    let s = fixtureState();
    s.empire = { credits: 10_000, materials: 10_000, fuel: 10_000 };
    for (let i = 0; i < SUPPORT.maxFleets; i++) {
      s = dispatchSim(s, { type: 'COMMISSION' });
    }
    expect(s.supports).toHaveLength(SUPPORT.maxFleets);
    const c0 = s.empire.credits;
    s = dispatchSim(s, { type: 'COMMISSION' });
    expect(s.supports).toHaveLength(SUPPORT.maxFleets);
    expect(s.empire.credits).toBe(c0);
  });
});

describe('support fleets: state machine (C13)', () => {
  it('unassigned fleets patrol home with zero input (Tier-0 fallback)', () => {
    let s = fixtureState();
    s = dispatchSim(s, { type: 'COMMISSION' });
    expect(fleet(s).supportState).toBe('patrolling');
    s = runYears(s, 3); // no commands whatsoever
    expect(fleet(s).systemId).toBe('S04');
    expect(fleet(s).supportState).toBe('patrolling');
    expect(fleet(s).travel).toBeNull();
  });

  it('an unassigned fleet away from home travels home (range + fuel identical to flagship)', () => {
    let s = fixtureState();
    s = dispatchSim(s, { type: 'COMMISSION' });
    // White-box: place it at S05 (20u away — close band: 1yr, 1 fuel/ship).
    fleet(s).systemId = 'S05';
    const baseline = runYears(fixtureState(), 1); // same income, no voyage
    s = runYears(s, 1);
    expect(fleet(s).travel?.arriveTick).toBe(2); // exact-tick arrival, 1yr band
    expect(baseline.empire.fuel - s.empire.fuel).toBe(3); // 3 ships × 1 fuel/ship
    s = runYears(s, 1);
    expect(fleet(s).systemId).toBe('S04');
    expect(fleet(s).supportState).toBe('patrolling');
    expect(fleet(s).travel).toBeNull();
  });

  it('out of range: the fleet stays idle rather than break the jump limit', () => {
    let s = fixtureState();
    s = dispatchSim(s, { type: 'COMMISSION' });
    s.galaxy.systems.find((x) => x.id === 'S07')!.x = 150; // ~140u from S04 > 80
    fleet(s).systemId = 'S07';
    const baseline = runYears(fixtureState(), 1);
    s = runYears(s, 1);
    expect(fleet(s).systemId).toBe('S07'); // did not move
    expect(fleet(s).travel).toBeNull();
    expect(fleet(s).supportState).toBe('idle');
    expect(baseline.empire.fuel - s.empire.fuel).toBe(0); // nothing burned
  });

  it('no fuel: the fleet stays idle, the tank never goes negative', () => {
    let s = fixtureState();
    s = dispatchSim(s, { type: 'COMMISSION' });
    fleet(s).systemId = 'S07'; // medium band: 3 ships × 3 fuel = 9
    s.empire.fuel = 0; // even with income, 18 is out of reach this year
    s = runYears(s, 1);
    expect(fleet(s).systemId).toBe('S07');
    expect(fleet(s).travel).toBeNull();
    expect(fleet(s).supportState).toBe('idle');
    expect(s.empire.fuel).toBeGreaterThanOrEqual(0);
  });

  it('critically damaged: returns home when possible, then waits at home', () => {
    let s = fixtureState();
    s = dispatchSim(s, { type: 'COMMISSION' });
    fleet(s).systemId = 'S05';
    fleet(s).hull = SUPPORT.criticalHull - 5;
    s = runYears(s, 1);
    expect(fleet(s).supportState).toBe('returning');
    expect(fleet(s).travel?.toId).toBe('S04');
    s = runYears(s, 1); // arrives home, still damaged
    expect(fleet(s).systemId).toBe('S04');
    expect(fleet(s).supportState).toBe('idle');
  });

  it('never invades: no world is taken for the player by a support fleet', () => {
    let s = fixtureState();
    s = dispatchSim(s, { type: 'COMMISSION' });
    // Park the fleet next to the weakest neutral world for years (S05 is
    // its "home" so it stays put, patrolling).
    fleet(s).systemId = 'S05';
    fleet(s).homeId = 'S05';
    s = runYears(s, 6);
    // Rivals may expand (that's their job) — but a support fleet never
    // takes a world for the player without explicit orders (C13: none exist).
    const takenByPlayer = s.galaxy.systems.filter(
      (t) => t.ownerId === 'player' && t.previousOwnerId !== 'player' && t.previousOwnerId !== null,
    );
    // S04 is the homeworld (no previous owner); anything else "player" with a
    // non-player previous owner would be a support-fleet invasion.
    for (const t of takenByPlayer) {
      expect(t.id).toBe('S04');
    }
  });

  it('support fleet movement is deterministic (no RNG draws)', () => {
    const mk = () => {
      let s = fixtureState();
      s = dispatchSim(s, { type: 'COMMISSION' });
      fleet(s).systemId = 'S05';
      return runYears(s, 4);
    };
    const a = mk();
    const b = mk();
    expect(a.supports).toEqual(b.supports);
    expect(a.empire.fuel).toBe(b.empire.fuel);
  });
});
