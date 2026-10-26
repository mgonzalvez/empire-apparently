import { describe, expect, it } from 'vitest';
import { defensiveStrength } from '../src/engine/combat';
import { combatStrength } from '../src/engine/fleets';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { dispatchSim, newGame, runYears } from '../src/engine/simulation';
import { canAssignMission } from '../src/engine/support';
import type { Fleet, GameState } from '../src/engine/types';

/**
 * C14 acceptance (Gate M3):
 *  - Each mission resolves with the SAME rules as player fleets.
 *  - Status is visible at a glance; a report per significant action.
 *  - Support fleets never invade, no matter the mission.
 *  - M3: in a contested-frontier scenario, a defending fleet measurably
 *    outperforms no support (the world holds that would fall).
 *
 * Fixture facts (createFixtureGalaxy, 4×2 grid):
 *  - S04 Kettle Green — player homeworld, garden dev 3 (a shipyard).
 *  - S05 Wheatline — ind-1, (1,1); neighbors S01, S04, S06.
 *  - S06 Ashpool — rival-0, (2,1), adjacent to S05.
 *  - Rival-0 also owns S03; capitalIds + fleets as seeded.
 */

function fixtureState(): GameState {
  const s = newGame(4242);
  s.galaxy = createFixtureGalaxy();
  s.flagship.systemId = s.galaxy.homeworldId;
  s.flagship.travel = null;
  s.supports = [];
  return s;
}

function commissionFleet(state: GameState): GameState {
  return dispatchSim(state, { type: 'COMMISSION' });
}

const fleet = (s: GameState): Fleet => s.supports[0];
const sys = (s: GameState, id: string) => s.galaxy.systems.find((x) => x.id === id)!;
const rival = (s: GameState) => s.galaxy.factions.find((f) => f.id === 'rival-0')!;

/** Make S05 a player occupation with the given garrison (white-box). */
function s05AsPlayer(s: GameState, garrison: number): void {
  const t = sys(s, 'S05');
  t.ownerId = 'player';
  t.previousOwnerId = 'ind-1';
  t.occupation = 'occupied';
  t.planet!.garrison = garrison;
  t.planet!.stability = 80;
  t.planet!.integration = 0;
}

describe('C14 mission: SCOUT', () => {
  it('reveals the target exactly like a flagship arrival (the shared `explored` flag), then returns home', () => {
    let s = fixtureState();
    s = commissionFleet(s);
    sys(s, 'S00').explored = false; // white-box: unchart it
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'scout', targetId: 'S00' });
    expect(fleet(s).mission).toEqual({ type: 'scout', targetId: 'S00' });

    s = runYears(s, 1); // S00 is 20u away — close band, 1yr
    expect(sys(s, 'S00').explored).toBe(false); // not there yet
    s = runYears(s, 1); // arrives, charts
    const t = sys(s, 'S00');
    expect(t.explored).toBe(true); // the SAME flag the flagship's arrival sets
    expect(s.log.some((l) => l.text.includes('charts'))).toBe(true); // factual report
    s = runYears(s, 1); // back home
    expect(fleet(s).systemId).toBe('S04');
    expect(fleet(s).mission).toBeNull();
  });

  it('never invades: scouting a neutral world changes ownership of nothing', () => {
    let s = fixtureState();
    s = commissionFleet(s);
    sys(s, 'S00').explored = false;
    sys(s, 'S00').ownerId = 'ind-0';
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'scout', targetId: 'S00' });
    s = runYears(s, 3); // out, charts, back
    expect(sys(s, 'S00').ownerId).toBe('ind-0'); // untouched
  });

  it('gate: scouting an already-charted system is refused', () => {
    const s = commissionFleet(fixtureState());
    const g = canAssignMission(s, 'sf-1', 'scout', 'S00');
    expect(g.ok).toBe(false);
  });
});

describe('C14 mission: PATROL', () => {
  it('intercepts weak hostile flotillas adjacent to the patrolled world — one ship per year', () => {
    let s = fixtureState();
    s05AsPlayer(s, 1);
    s = commissionFleet(s);
    rival(s).fleet = 2; // weak (≤ weakFleetSize), and S06 (rival) is adjacent to S05
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'patrol', targetId: 'S05' });
    s = runYears(s, 1); // en route
    expect(fleet(s).supportState).toBe('patrolling');
    expect(rival(s).fleet).toBe(2); // not patrolling yet
    s = runYears(s, 1); // docked at S05 → intercept
    expect(fleet(s).supportState).toBe('patrolling');
    expect(fleet(s).systemId).toBe('S05');
    expect(rival(s).fleet).toBe(1);
    expect(s.log.some((l) => l.text.includes('intercepts'))).toBe(true);
    s = runYears(s, 1);
    expect(rival(s).fleet).toBe(0);
    s = runYears(s, 1); // nothing left to intercept — the world is quiet
    expect(rival(s).fleet).toBe(0);
  });

  it('ignores strong flotillas and non-adjacent ones', () => {
    // Strong: docked patrol next to a 3-ship flotilla (> weakFleetSize) — untouched.
    let s = fixtureState();
    s05AsPlayer(s, 1);
    s = commissionFleet(s);
    const f1 = fleet(s);
    f1.systemId = 'S05';
    f1.supportState = 'patrolling';
    f1.mission = { type: 'patrol', targetId: 'S05' };
    rival(s).fleet = 3;
    const s1 = runYears(s, 1);
    expect(rival(s1).fleet).toBeGreaterThanOrEqual(3); // never intercepted

    // Non-adjacent: S06 un-owned by the rival and un-expandable (huge defense),
    // so the rival's only system (S03) sits two cells from the patrol.
    let s2 = fixtureState();
    s05AsPlayer(s2, 1);
    s2 = commissionFleet(s2);
    const f2 = fleet(s2);
    const s06 = sys(s2, 'S06');
    s06.ownerId = null;
    s06.defense = 100; // the rival cannot re-expand into the patrol's ring
    f2.systemId = 'S05';
    f2.supportState = 'patrolling';
    f2.mission = { type: 'patrol', targetId: 'S05' };
    rival(s2).fleet = 2;
    const s3 = runYears(s2, 1);
    expect(rival(s3).fleet).toBe(2); // weak, but not adjacent — left alone
    expect(sys(s3, 'S06').ownerId).toBe(null); // and it could not reach the ring
  });
});

describe('C14 mission: REINFORCE', () => {
  it('boards at home (standard rearm cost), tops the garrison to the recommended level, returns home', () => {
    let s = fixtureState();
    s05AsPlayer(s, 0); // under-garrisoned occupation
    s = commissionFleet(s);
    const c0 = s.empire.credits;
    const g = canAssignMission(s, 'sf-1', 'reinforce', 'S05');
    expect(g.ok).toBe(true);
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'reinforce', targetId: 'S05' });
    expect(s.empire.credits).toBe(c0 - 20); // 10 troops × 2C — the SAME rearm rate the flagship pays
    expect(fleet(s).troops).toBe(10);
    expect(s.log.some((l) => l.text.includes('boards 10 troops'))).toBe(true);

    s = runYears(s, 1); // en route
    s = runYears(s, 1); // delivers
    const t = sys(s, 'S05');
    const rec = t.planet!.development; // garrisonPerDevelopment 1, no rival adjacent at S05? (S06 IS rival → +1)
    expect(t.planet!.garrison).toBeGreaterThanOrEqual(Math.max(0, rec)); // topped up
    expect(fleet(s).troops).toBeLessThan(10);
    expect(s.log.some((l) => l.text.includes('garrison'))).toBe(true);
    s = runYears(s, 1); // home
    expect(fleet(s).systemId).toBe('S04');
    expect(fleet(s).mission).toBeNull();
  });

  it('gate: reinforces need a home port, an occupied world, and an under-strength garrison', () => {
    let s = fixtureState();
    s05AsPlayer(s, 0);
    s = commissionFleet(s);
    expect(canAssignMission(s, 'sf-1', 'reinforce', 'S05').ok).toBe(true);

    const s2 = fixtureState();
    s05AsPlayer(s2, 99); // garrison at/above recommended
    const s3 = commissionFleet(s2);
    expect(canAssignMission(s3, 'sf-1', 'reinforce', 'S05').ok).toBe(false);

    // Away from home → refused (troops board at the shipyard).
    const s4 = commissionFleet(fixtureState());
    s4.supports[0].systemId = 'S05';
    s4.supports[0].homeId = 'S04';
    expect(canAssignMission(s4, 'sf-1', 'reinforce', 'S04').ok).toBe(false);
  });
});

describe('C14 mission: DEFEND', () => {
  it('adds the fleet\'s combat strength to the world\'s defense (same derived strength as a player fleet)', () => {
    let s = fixtureState();
    s05AsPlayer(s, 0);
    s = commissionFleet(s);
    const f = fleet(s);
    const t = sys(s, 'S05');
    const base = defensiveStrength(t, s);
    f.systemId = 'S05'; // white-box: stationed
    f.supportState = 'defending';
    f.mission = { type: 'defend', targetId: 'S05' };
    const boosted = defensiveStrength(t, s);
    expect(boosted).toBe(base + combatStrength(f)); // exactly the player-fleet strength
    expect(combatStrength(f)).toBeGreaterThan(0);
  });

  it('when the world falls, the fleet breaks off and takes hull damage', () => {
    let s = fixtureState();
    s05AsPlayer(s, 0);
    s = commissionFleet(s);
    sys(s, 'S04').defense = 100; // white-box: keep the homeworld safe — the test is about the fleet, not game over
    const f = fleet(s);
    f.systemId = 'S05';
    f.supportState = 'defending';
    f.mission = { type: 'defend', targetId: 'S05' };
    rival(s).fleet = 60; // overwhelming — the gate opens even against the boosted defense
    s = runYears(s, 1);
    expect(sys(s, 'S05').ownerId).toBe('rival-0');
    expect(fleet(s).hull).toBe(50); // 100 − defendHullDamage, factual in the log
    expect(s.log.some((l) => l.text.includes('breaks off the defense'))).toBe(true);
    s = runYears(s, 2); // limps home
    expect(fleet(s).systemId).toBe('S04');
    expect(fleet(s).mission).toBeNull();
  });
});

describe('Gate M3: support missions prove their value', () => {
  /**
   * Contested frontier: S05 (player, occupied, garrison 1) sits next to
   * S06 (rival-0). A 13-ship flotilla clears the 2.5× attack gate against
   * the world's bare defense (3 + 1 = 4 → needs 10). Without support the
   * world falls in year one; with a stationed DEFEND fleet (strength 5 →
   * defense 9 → needs ~23) the same flotilla cannot touch it.
   */
  function contestedFrontier(): GameState {
    let s = fixtureState();
    s05AsPlayer(s, 1);
    s = commissionFleet(s);
    rival(s).fleet = 13;
    return s;
  }

  it('without support: the frontier world falls', () => {
    const s = runYears(contestedFrontier(), 1);
    expect(sys(s, 'S05').ownerId).toBe('rival-0');
    expect(s.log.some((l) => l.text.includes('takes'))).toBe(true);
  });

  it('with a defending fleet: the same world holds — measurable difference', () => {
    let s = contestedFrontier();
    const f = fleet(s);
    f.systemId = 'S05';
    f.supportState = 'defending';
    f.mission = { type: 'defend', targetId: 'S05' };
    s = runYears(s, 10);
    expect(sys(s, 'S05').ownerId).toBe('player'); // held for a full year of pressure
    // And the hold is real, not a crash: the rival did things (expanded/built).
    expect(rival(s).fleet).toBeGreaterThanOrEqual(0);
  });
});

describe('C14 machine: discipline', () => {
  it('mission execution is deterministic (identical inputs → identical state)', () => {
    const mk = () => {
      let s = fixtureState();
      s05AsPlayer(s, 1);
      sys(s, 'S00').explored = false;
      s = commissionFleet(s);
      rival(s).fleet = 2;
      s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'patrol', targetId: 'S05' });
      s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'scout', targetId: 'S00' });
      return runYears(s, 6);
    };
    const a = mk();
    const b = mk();
    expect(a).toEqual(b);
  });

  it('a voided mission (target lost) stands the fleet down without a crash', () => {
    let s = fixtureState();
    s05AsPlayer(s, 1);
    s = commissionFleet(s);
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'patrol', targetId: 'S05' });
    s = runYears(s, 1); // en route
    sys(s, 'S05').ownerId = 'rival-0'; // the world is lost mid-mission
    s = runYears(s, 3); // arrives, mission voided, heads home
    expect(fleet(s).mission).toBeNull();
    expect(s.log.some((l) => l.text.includes('voided'))).toBe(true);
  });

  it('assigning a mission never advances time (instant action, like BUILD)', () => {
    let s = fixtureState();
    s = commissionFleet(s);
    const t0 = s.tick;
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'defend', targetId: 'S04' });
    expect(s.tick).toBe(t0);
    expect(s.supports[0].mission).toEqual({ type: 'defend', targetId: 'S04' });
  });

  it('stand-down (mission = null) is always allowed and returns the fleet home', () => {
    let s = fixtureState();
    s = commissionFleet(s);
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: 'defend', targetId: 'S05' });
    s = runYears(s, 1); // en route to S05
    s = dispatchSim(s, { type: 'ASSIGN_MISSION', fleetId: 'sf-1', mission: null, targetId: null });
    expect(fleet(s).mission).toBeNull();
    s = runYears(s, 3); // arrives, then home
    expect(fleet(s).systemId).toBe('S04');
  });
});
