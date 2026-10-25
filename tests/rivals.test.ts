import { describe, expect, it } from 'vitest';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { newGame, runYears } from '../src/engine/simulation';
import type { GameState } from '../src/engine/types';

/**
 * Fixture facts (createFixtureGalaxy): one rival — rival-0 "The Patient
 * Fleet" — owns S03 (foundry d3, defense 8) and S06 (quarry d2, defense 6).
 * S05 is independent (ind-1, defense 4, adjacent to S06: 6 ≥ 1.5×4).
 */

function fixtureState(): GameState {
  const s = newGame(4242);
  s.galaxy = createFixtureGalaxy();
  return s;
}

const sys = (s: GameState, id: string) => s.galaxy.systems.find((x) => x.id === id)!;

describe('rivals v1 (C8)', () => {
  it('a rival expands into a favorable independent neighbor', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player'; // shield the neutral pick
    sys(s, 'S07').ownerId = 'player'; // shield the uninhabited pick (S03 would take it first)
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
    // Now S03 (10, binary-star foundry) and S06 (6) face only S02 (8): 10 < 12, 6 < 12.
    s = runYears(s, 1);
    expect(sys(s, 'S06').defense).toBe(7); // weakest reinforced +1
    expect(sys(s, 'S03').defense).toBe(10); // untouched (one action per rival)
  });

  it('rivals never take player worlds, even when overwhelmingly stronger', () => {
    let s = fixtureState();
    sys(s, 'S03').defense = 200;
    s = runYears(s, 3);
    expect(sys(s, 'S04').ownerId).toBe('player'); // homeworld
    expect(sys(s, 'S06').ownerId).toBe('rival-0'); // its own system, untouched
    // ...while genuinely expanding into unclaimed space:
    expect(sys(s, 'S05').ownerId).toBe('rival-0');
  });

  it('each rival takes at most one action per year', () => {
    let s = fixtureState();
    sys(s, 'S01').ownerId = 'player'; // make S05 the pick
    sys(s, 'S07').ownerId = 'player'; // keep S03 from spending the action on S07
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

  it('reinforcement stops at the defense target', () => {
    let s = fixtureState();
    // Shield the expandable worlds so only reinforcing happens.
    sys(s, 'S01').ownerId = 'player';
    sys(s, 'S05').ownerId = 'player';
    sys(s, 'S07').ownerId = 'player';
    s = runYears(s, 10);
    expect(sys(s, 'S03').defense).toBe(10); // already at target: 4 + 2×3
    expect(sys(s, 'S06').defense).toBe(8); // target: 4 + 2×2
  });
});
