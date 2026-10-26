import { describe, expect, it } from 'vitest';
import { CAMPAIGN, RIVAL } from '../src/data/balance';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { newGame, runYears } from '../src/engine/simulation';
import type { GameState } from '../src/engine/types';
import { playCruise } from './campaign-sim';

/**
 * Fixture facts (createFixtureGalaxy; C12 defense table: base 2 + 1×dev):
 * one rival — rival-0 "The Patient Fleet" (fleet 2) — owns S03 "Bureau of
 * Arrival" (foundry d3, defense 7) and S06 "Milestone" (quarry d2, defense 4).
 * S01 "Cold Ledger" (d1, defense 3) is adjacent to S06; S05 is independent
 * (ind-1, defense 3); S07 is uninhabited (defense 1) and adjacent to S03.
 */

function fixtureState(): GameState {
  const s = newGame(4242);
  s.galaxy = createFixtureGalaxy();
  return s;
}

const sys = (s: GameState, id: string) => s.galaxy.systems.find((x) => x.id === id)!;
const rivalFleet = (s: GameState) =>
  s.galaxy.factions.find((f) => f.id === 'rival-0')!.fleet;

describe('rivals (C8/C11)', () => {
  it('a rival expands into a favorable independent neighbor', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player'; // shield the neutral pick
    sys(s, 'S07').ownerId = 'player'; // shield the uninhabited pick (S03 would take it first)
    sys(s, 'S06').defense = 5; // 5 ≥ 1.5×3: favorable odds on S05
    s = runYears(s, 1);
    const t = sys(s, 'S05');
    expect(t.ownerId).toBe('rival-0');
    expect(t.previousOwnerId).toBe('ind-1');
    expect(t.occupation).toBe('none');
    expect(s.log.some((l) => l.kind === 'event' && l.text.includes('takes The Free Post'))).toBe(true);
  });

  it('a rival without a favorable target reinforces its weakest system', () => {
    let s = fixtureState();
    // Shield every neutral world from expansion:
    sys(s, 'S01').ownerId = 'player';
    sys(s, 'S05').ownerId = 'player';
    sys(s, 'S07').ownerId = 'player';
    // Now S03 (7) and S06 (4) face only S02 (5): 7 < 7.5, 4 < 7.5.
    s = runYears(s, 1);
    expect(sys(s, 'S06').defense).toBe(5); // weakest reinforced +1
    expect(sys(s, 'S03').defense).toBe(7); // untouched (one action per rival)
  });

  it('a rival does not attack a player world below the attack ratio — but still expands', () => {
    let s = fixtureState();
    sys(s, 'S04').defense = 2; // homeworld, adjacent to S05 once the rival gets there
    sys(s, 'S06').defense = 5; // 5 ≥ 1.5×3: favorable odds on S05 from tick 2
    s = runYears(s, 3);
    expect(sys(s, 'S04').ownerId).toBe('player'); // fleet 3 < 2× any defense: no attack
    expect(rivalFleet(s)).toBe(RIVAL.startingFleet); // nothing built yet (expand/reinforce first)
    // ...while genuinely expanding into unclaimed space:
    expect(sys(s, 'S05').ownerId).toBe('rival-0');
  });

  it('each rival takes at most one action per year', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player'; // make S05 the pick
    sys(s, 'S07').ownerId = 'player'; // keep S03 from spending the action on S07
    sys(s, 'S06').defense = 5; // 5 ≥ 1.5×3: favorable odds on S05
    // S06 takes S05 on tick 1, so S06 must NOT also reinforce that year.
    const before = sys(s, 'S06').defense;
    s = runYears(s, 1);
    expect(sys(s, 'S06').defense).toBe(before);
    expect(sys(s, 'S05').ownerId).toBe('rival-0');
  });

  it('expansion is deterministic: same seed, same rival behavior', () => {
    let a = fixtureState();
    let b = fixtureState();
    a = runYears(a, 4);
    b = runYears(b, 4);
    const snap = (g: GameState) =>
      g.galaxy.systems.map((x) => [x.id, x.ownerId, x.defense] as const);
    expect(snap(a)).toEqual(snap(b));
  });

  it('reinforcement stops at the defense target, then the fleet builds', () => {
    let s = fixtureState();
    // Shield the expandable worlds so only reinforcing/building happens.
    sys(s, 'S01').ownerId = 'player';
    sys(s, 'S02').ownerId = 'player'; // S06's expansion pick once reinforced
    sys(s, 'S05').ownerId = 'player';
    sys(s, 'S07').ownerId = 'player';
    sys(s, 'S03').defense = 10; // already at target: 4 + 2×3
    sys(s, 'S06').defense = 6;
    s = runYears(s, 3); // t1: 6→7, t2: 7→8, t3: nothing left to do → build
    expect(sys(s, 'S03').defense).toBe(10); // already at target: 4 + 2×3
    expect(sys(s, 'S06').defense).toBe(8); // target: 4 + 2×2
    expect(rivalFleet(s)).toBe(RIVAL.startingFleet + 1);
  });
});

describe('rivals v2 (C11)', () => {
  it('a rival fleet takes an adjacent player world at ≥ the attack ratio — and loses ships', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player'; // defense 3 — the flotilla clears 2.5× (needs 7.5)
    sys(s, 'S01').planet!.garrison = 0;
    s.galaxy.factions.find((f) => f.id === 'rival-0')!.fleet = 10;
    s = runYears(s, 1);
    const t = sys(s, 'S01');
    expect(t.ownerId).toBe('rival-0');
    expect(t.previousOwnerId).toBe('player');
    expect(t.occupation).toBe('none');
    expect(t.planet!.garrison).toBe(0); // dispersed
    // The flotilla took losses (≈ 1/4 at a 3.3:1 margin) — attacks pace themselves.
    expect(rivalFleet(s)).toBeLessThan(10);
    expect(rivalFleet(s)).toBeGreaterThan(4);
    // Factual, logged, no hidden moves:
    expect(s.log.some((l) => l.kind === 'warning' && l.text.includes('takes Cold Ledger'))).toBe(true);
    // And the budget held: S06 did not ALSO expand into S05 that year.
    expect(sys(s, 'S05').ownerId).toBe('ind-1');
  });

  it('below the attack ratio the rival does not attack — it builds instead', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player'; // fleet 2 < 2.5×3: no attack
    sys(s, 'S02').ownerId = 'player';
    sys(s, 'S05').ownerId = 'player';
    sys(s, 'S07').ownerId = 'player'; // shield S03's uninhabited pick
    sys(s, 'S03').defense = 10; // at target — nothing to reinforce
    sys(s, 'S06').defense = 8; // at target — nothing to reinforce
    s = runYears(s, 1);
    expect(sys(s, 'S01').ownerId).toBe('player');
    expect(rivalFleet(s)).toBe(RIVAL.startingFleet + 1);
    expect(s.log.some((l) => l.text.includes('flotilla grows to'))).toBe(true);
  });

  it('a garrison counts as defense: it raises the ratio the flotilla must clear', () => {
    let s = fixtureState();
    const t = sys(s, 'S01');
    t.ownerId = 'player';
    t.planet!.garrison = 3; // effective defense 6 — needs 15, the flotilla has 10
    sys(s, 'S05').ownerId = 'player'; // the UNGARRISONED neighbor (defense 3: needs only 7.5)
    sys(s, 'S07').ownerId = 'player'; // shield S03's uninhabited pick
    sys(s, 'S06').defense = 8;
    s.galaxy.factions.find((f) => f.id === 'rival-0')!.fleet = 10;
    s = runYears(s, 1);
    expect(t.ownerId).toBe('player'); // the garrisoned world holds
    expect(sys(s, 'S05').ownerId).toBe('rival-0'); // …its garrisonless twin does not
    expect(s.log.some((l) => l.text.includes('takes Cold Ledger'))).toBe(false);
  });

  it('reinforce and build actions are logged (no rival action is invisible)', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player';
    sys(s, 'S02').ownerId = 'player';
    sys(s, 'S05').ownerId = 'player';
    sys(s, 'S07').ownerId = 'player';
    sys(s, 'S03').defense = 10; // at target from the start
    s = runYears(s, 1);
    expect(s.log.some((l) => l.text.includes('reinforces Milestone'))).toBe(true);
    sys(s, 'S06').defense = 8; // at target from now on
    s = runYears(s, 1);
    expect(s.log.some((l) => l.text.includes("flotilla grows to"))).toBe(true);
  });

  it('rivals never fight each other', () => {
    const s = runYears(newGame(42), 5); // 20-system galaxy, three rivals
    const rivalIds = new Set(
      s.galaxy.factions.filter((f) => f.kind === 'rival').map((f) => f.id),
    );
    for (const t of s.galaxy.systems) {
      if (t.ownerId !== null && rivalIds.has(t.ownerId)) {
        expect(t.previousOwnerId === null || !rivalIds.has(t.previousOwnerId)).toBe(true);
      }
    }
  });

  it('the player can still win when a rival takes neutral worlds first (acceptance)', () => {
    let s = fixtureState();
    s.flagship.systemId = s.galaxy.homeworldId;
    sys(s, 'S07').ownerId = 'player'; // keep the empty star out of it — S05 is the neutral pick
    // Three passive years: the rival expands into neutral space unopposed.
    s = runYears(s, 3);
    expect(sys(s, 'S05').ownerId).toBe('rival-0'); // it got there first
    const r = playCruise(s, CAMPAIGN.deadlineYears + 1);
    expect(r.ended).toBe('victory');
    expect(r.ticks).toBeLessThanOrEqual(CAMPAIGN.deadlineYears);
  });
});
