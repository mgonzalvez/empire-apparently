import { describe, expect, it } from 'vitest';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { recommendedGarrison } from '../src/engine/occupation';
import { newGame, runYears } from '../src/engine/simulation';
import type { GameState, Planet, System } from '../src/engine/types';

const SEED = 4242;

function fixtureState(): GameState {
  const s = newGame(SEED);
  s.galaxy = createFixtureGalaxy();
  return s;
}

/** A player-occupied world under the player's control (bypasses combat). */
function occupy(s: GameState, systemId: string, garrison: number): System {
  const t = s.galaxy.systems.find((x) => x.id === systemId)!;
  t.previousOwnerId = t.ownerId; // the old owner, if any
  t.ownerId = 'player';
  t.occupation = 'occupied';
  t.planet!.garrison = garrison;
  t.planet!.stability = 100;
  t.planet!.integration = 0;
  return t;
}

describe('occupation (C8)', () => {
  it('recommended garrison = development', () => {
    const p: Planet = {
      name: 'X', type: 'garden', specialization: 'balanced', development: 3,
      population: 5, stability: 100, integration: 0, garrison: 0,
    };
    expect(recommendedGarrison(p)).toBe(3);
  });

  it('a garrisoned world integrates over ticks (100 stability → ~2 years)', () => {
    let s = fixtureState();
    occupy(s, 'S01', 5); // recommended = dev 1
    expect(s.galaxy.systems.find((x) => x.id === 'S01')!.planet!.development).toBe(1);
    s = runYears(s, 1);
    // stability 100 → +50 integration
    expect(s.galaxy.systems.find((x) => x.id === 'S01')!.planet!.integration).toBe(50);
    expect(s.galaxy.systems.find((x) => x.id === 'S01')!.occupation).toBe('occupied');
    s = runYears(s, 1);
    const after = s.galaxy.systems.find((x) => x.id === 'S01')!;
    expect(after.occupation).toBe('integrated');
    expect(after.planet!.integration).toBe(100);
    expect(after.planet!.stability).toBe(100);
    expect(s.log.some((l) => l.text.includes('S01') || l.text.includes(after.planet!.name))).toBe(true);
  });

  it('integration rate is proportional to stability', () => {
    let s = fixtureState();
    const t = occupy(s, 'S02', 5);
    t.planet!.stability = 50;
    s = runYears(s, 1);
    // stability 50→60, then +60×0.5 = 30
    let w = s.galaxy.systems.find((x) => x.id === 'S02')!;
    expect(w.planet!.stability).toBe(60);
    expect(w.planet!.integration).toBe(30);
    s = runYears(s, 1);
    w = s.galaxy.systems.find((x) => x.id === 'S02')!;
    // 60→70, +35 → 65
    expect(w.planet!.stability).toBe(70);
    expect(w.planet!.integration).toBe(65);
  });

  it('an under-garrisoned world declines and rebels to its previous faction', () => {
    let s = fixtureState();
    // Isolate occupation: no rivals to re-take the seceding world.
    s.galaxy.factions = s.galaxy.factions.filter((f) => f.kind !== 'rival');
    // S05 is ind-1's → previous owner is the independent faction.
    occupy(s, 'S05', 0); // recommended = dev 1 → under-garrisoned
    s = runYears(s, 5);
    const after = s.galaxy.systems.find((x) => x.id === 'S05')!;
    expect(after.ownerId).toBe('ind-1');
    expect(after.occupation).toBe('none');
    expect(after.planet!.garrison).toBe(0);
    expect(after.planet!.stability).toBe(100);
    expect(after.planet!.integration).toBe(0);
    expect(s.log.some((l) => l.kind === 'warning' && l.text.includes('rebels'))).toBe(true);
  });

  it('an under-garrisoned world with no previous owner secedes to unclaimed', () => {
    let s = fixtureState();
    s.galaxy.factions = s.galaxy.factions.filter((f) => f.kind !== 'rival');
    occupy(s, 'S01', 0); // neutral → previousOwnerId null
    s = runYears(s, 5);
    const after = s.galaxy.systems.find((x) => x.id === 'S01')!;
    expect(after.ownerId).toBeNull();
    expect(after.occupation).toBe('none');
  });

  it('an integrated world never rebels, even ungarrisoned', () => {
    let s = fixtureState();
    const t = occupy(s, 'S00', 0);
    t.occupation = 'integrated';
    t.planet!.integration = 100;
    s = runYears(s, 8);
    const after = s.galaxy.systems.find((x) => x.id === 'S00')!;
    expect(after.ownerId).toBe('player');
    expect(after.occupation).toBe('integrated');
  });

  it('the homeworld starts fully integrated', () => {
    const s = newGame(SEED);
    const home = s.galaxy.systems.find((x) => x.id === s.galaxy.homeworldId)!;
    expect(home.occupation).toBe('integrated');
    expect(home.planet!.integration).toBe(100);
    expect(home.planet!.garrison).toBe(0);
  });

  it('rival expansions do not trigger occupation (only player worlds settle)', () => {
    let s = fixtureState();
    // S06 (rival-0, defense 6) takes S05 (ind-1, defense 4) on tick 1.
    sys2(s, 'S01').ownerId = 'player'; // shield S01 so S05 is the pick
    sys2(s, 'S07').ownerId = 'player'; // keep S03 from spending the action on S07
    const t = s.galaxy.systems.find((x) => x.id === 'S05')!;
    t.planet!.garrison = 4;
    s = runYears(s, 1);
    const after = s.galaxy.systems.find((x) => x.id === 'S05')!;
    expect(after.ownerId).toBe('rival-0');
    expect(after.planet!.garrison).toBe(0); // dispersed
    expect(after.occupation).toBe('none');
  });

function sys2(s: GameState, id: string) {
  return s.galaxy.systems.find((x) => x.id === id)!;
}
});
